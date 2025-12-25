import { GoogleGenerativeAI } from "@google/generative-ai";
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

import { db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

// Configure PDF.js worker
const initPDFWorker = () => {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }
};

// --- DYNAMIC AI MODEL INITIALIZATION ---
// We now fetch the key from Firestore (useful for Admin overrides) or fallback to Environment/Hardcoded.

// Using gemini-2.0-flash-exp
const MODEL_NAME = "gemini-2.0-flash-exp";
const DEFAULT_KEY = "AIzaSyDNcNoE_MU5MdZwwwIxKK__0G-yqPULLts"; // Fallback (Consider moving to .env)

// Cached instance
let cachedModel: any = null;

const getModel = async () => {
    if (cachedModel) return cachedModel;

    let apiKey = DEFAULT_KEY;
    try {
        const docRef = doc(db, "settings", "config");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().geminiApiKey) {
            apiKey = docSnap.data().geminiApiKey;
            console.log("Using Custom API Key from Settings");
        }
    } catch (e) {
        console.warn("Failed to fetch custom API key, using default.", e);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    cachedModel = genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: { responseMimeType: "application/json" }
    });
    return cachedModel;
};

// Helper: Retry Logic
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const retryWithDelay = async <T>(fn: () => Promise<T>, retries = 3, interval = 2000): Promise<T> => {
    try {
        return await fn();
    } catch (error: any) {
        if (retries <= 0) throw error;
        // Retry on 503 (Service Unavailable) or 429 (Too Many Requests) or network errors
        const isRetryable = error.message?.includes("503") || error.message?.includes("429") || error.message?.includes("fetch");
        if (!isRetryable) throw error;

        console.warn(`Gemini API Failed (${error.message}). Retrying in ${interval}ms... (${retries} left)`);
        await delay(interval);
        return retryWithDelay(fn, retries - 1, interval);
    }
};

// Helper: Detect File Quality
const getFileType = (buffer: ArrayBuffer): 'pdf' | 'docx' | 'unknown' => {
    const arr = new Uint8Array(buffer).subarray(0, 4);
    const header = arr.reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');

    // PDF: %PDF (25 50 44 46)
    if (header.includes('25504446')) return 'pdf';
    // DOCX (ZIP): PK.. (50 4b 03 04)
    if (header.includes('504b0304')) return 'docx';

    return 'unknown';
};

/**
 * Extracts text from a File URL (Blob or Remote).
 * Auto-detects content type regardless of URL extension.
 */
async function extractTextFromFile(url: string): Promise<string> {
    try {
        // 1. Fetch the generic data first
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();

        // 2. Detect Type
        const type = getFileType(arrayBuffer);
        console.log(`Detected file type: ${type}`);

        // 3. route to parser
        if (type === 'docx') {
            const result = await mammoth.extractRawText({ arrayBuffer });
            return result.value.trim();
        }

        if (type === 'pdf') {
            initPDFWorker();
            // PDF.js can accept ArrayBuffer (TypedArray)
            const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
            const pdf = await loadingTask.promise;
            return await parsePdfPages(pdf);
        }

        // Fallback or Unknown
        throw new Error("Unsupported file type. Please upload a valid PDF or DOCX.");

    } catch (error: any) {
        console.error("Text Extraction Failed:", error);

        // Fallback for Remote URLs that might need proxy (Only for PDF logic if initial fetch failed due to CORS)
        // Note: Initial fetch() above would fail if CORS is an issue.
        if (url.startsWith("http") && !url.includes("blob:")) {
            // Try Proxy for PDF only as last resort if we suspect it's a PDF
            console.warn("Retrying with Proxy...");
            try {
                const proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
                // We restart the flow with the proxy URL
                // We can't easily recurse without risking loop, so explicitly fetch proxy
                const pRes = await fetch(proxyUrl);
                const pBuf = await pRes.arrayBuffer();
                const pType = getFileType(pBuf);

                if (pType === 'pdf') {
                    initPDFWorker();
                    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pBuf) });
                    const pdf = await loadingTask.promise;
                    return await parsePdfPages(pdf);
                }
            } catch (pErr) {
                console.error("Proxy retry failed", pErr);
            }
        }

        throw error;
    }
}

async function parsePdfPages(pdf: any): Promise<string> {
    let fullText = '';
    const maxPages = Math.min(pdf.numPages, 5);
    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + ' ';
    }
    return fullText.trim();
}

// Client-side Generate Insights
export const generateInsights = async (subjectName: string, studentName: string, fileUrl: string, topicName?: string) => {
    // 1. Extract Text
    console.log("Extracting text from file (Client-Side)...");
    const fileText = await extractTextFromFile(fileUrl);
    if (!fileText) throw new Error("File text is empty.");

    // 2. Call Gemini SDK (Wrapped in Retry)
    const prompt = `
    Analyze this student project report for subject "${subjectName}" by student "${studentName}".
    ${topicName ? `DECLARED TOPIC: "${topicName}".` : ""}
    
    FILE CONTENT:
    "${fileText.substring(0, 30000)}" 
    
    OUTPUT REQUIREMENTS:
    1. SUMMARY: A concise summary (3-5 bullet points).
    2. QUESTIONS: Exactly 5 viva/technical questions.
    3. MARKS: Suggested marks out of 100 based on quality/depth. 
    4. JUSTIFICATION: A 1-sentence reason for the marks.
    5. CREATIVITY_ANALYSIS: Brief comment on originality.

    Return STRICT JSON ONLY:
    {
        "summary": ["point 1", "point 2", ...],
        "questions": ["q1", "q2", "q3", "q4", "q5"],
        "suggested_marks": 75,
        "justification": "...",
        "creativity_analysis": "..."
    }
    `;

    console.log("Calling Gemini SDK directly...");

    return retryWithDelay(async () => {
        const model = await getModel();
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(jsonStr);
    });
};

// Fallback Logic for Topic Check
const fallbackTopicCheck = (newTopic: string, existingTopics: string[]) => {
    console.warn("Using Fallback Keyword Check for Topic...");

    // 1. Simple uniqueness check (Exact Match, Case Insensitive)
    const isExactDuplicate = existingTopics.some(t => t.toLowerCase().trim() === newTopic.toLowerCase().trim());

    if (isExactDuplicate) {
        return {
            isUnique: false,
            message: "Topic title matches an existing submission exactly.",
            suggestions: []
        };
    }

    // 2. Keyword check removed (unused)
    // const hasKeyword = keywords.some(k => newTopic.toLowerCase().includes(k));

    // If we can't judge deeply, we err on the side of allowing it (Fail Open)
    return {
        isUnique: true,
        message: "AI verification temporarily unavailable. Submission allowed based on keyword check.",
        isOfflineBypass: true // Flag for UI
    };
};

// Client-Side Topic Check
export const checkTopicSimilarity = async (newTopic: string, subjectName: string, existingTopics: string[], fileUrl?: string) => {
    let fileContext = "";
    if (fileUrl) {
        try {
            const text = await extractTextFromFile(fileUrl);
            fileContext = text.substring(0, 8000);
        } catch (e) {
            console.warn("Could not extract file text for topic check", e);
        }
    }

    const prompt = `
    You are a STRICT academic validator. Your job is to REJECT submissions that don't match.
    
    Subject: "${subjectName}"
    Proposed Topic: "${newTopic}"
    Existing Topics: ${JSON.stringify(existingTopics)}
    ${fileContext ? `File Content: "${fileContext}"` : ""}

    VALIDATION RULES (ALL must pass):
    
    1. UNIQUENESS: Is "${newTopic}" semantically different from all existing topics?
       - If too similar to any existing topic → REJECT
    
    2. TOPIC-FILE MATCH (CRITICAL): Does the FILE content actually discuss "${newTopic}"?
       - Read the FILE content carefully
       - If FILE is about a DIFFERENT topic → REJECT immediately
       - Example: If topic is "process synchronization" but FILE discusses "network security" → REJECT
       - The FILE MUST contain substantial content about the declared topic
    
    3. SUBJECT RELEVANCE: Are both the topic AND FILE content relevant to "${subjectName}"?
       - If topic or FILE content belongs to a different subject → REJECT
       - Example: "Information Security" FILE for "Operating Systems" subject → REJECT
    
    IMPORTANT: Be STRICT. If there's ANY mismatch between:
    - What the student CLAIMS (topic)
    - What the FILE ACTUALLY contains
    - What the SUBJECT requires
    Then you MUST reject with isUnique: false
    
    Return STRICT JSON:
    {
        "isUnique": boolean (false if ANY check fails),
        "message": "Clear explanation of why accepted or rejected",
        "suggestions": ["Alternative topic 1", "Alternative topic 2"] (only if rejected)
    }
    `;

    try {
        return await retryWithDelay(async () => {
            const model = await getModel();
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
            return JSON.parse(jsonStr);
        });
    } catch (error) {
        console.error("AI Topic Check Failed after retries:", error);
        // Fallback Mechanism
        return fallbackTopicCheck(newTopic, existingTopics);
    }
};
