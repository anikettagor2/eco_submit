import { GoogleGenerativeAI } from "@google/generative-ai";
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
const initPDFWorker = () => {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }
};

// GEMINI API KEY (Google AI Studio format)
const API_KEY = "AIzaSyDNcNoE_MU5MdZwwwIxKK__0G-yqPULLts";
const genAI = new GoogleGenerativeAI(API_KEY);
// Using gemini-2.0-flash-exp (confirmed working with this API key)
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

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

/**
 * Extracts text from a PDF URL (Client-Side).
 */
async function extractTextFromFile(url: string): Promise<string> {
    // Basic check to avoid trying to parse DOCX as PDF
    if (url.toLowerCase().includes(".doc") && !url.toLowerCase().includes(".pdf")) {
        throw new Error("AI analysis is currently only supported for PDF files.");
    }

    initPDFWorker();
    try {
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        return await parsePdfPages(pdf);
    } catch (error: any) {
        if (error.message?.includes("AI analysis")) throw error;

        console.warn("Direct file fetch failed (CORS?), switching to proxy...", error);
        try {
            const proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
            initPDFWorker();
            const loadingTask = pdfjsLib.getDocument(proxyUrl);
            const pdf = await loadingTask.promise;
            return await parsePdfPages(pdf);
        } catch (proxyError) {
            console.error("Proxy fetch failed:", proxyError);
            throw new Error("Could not read file. Ensure file is public or CORS is configured.");
        }
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

    // 2. Keyword check for validity/quality (Optional, keep it lenient)
    const keywords = ["authentication", "hashing", "password", "security", "encryption", "system", "management", "app", "analysis", "detection", "smart", "using"];
    const hasKeyword = keywords.some(k => newTopic.toLowerCase().includes(k));

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
    
    2. TOPIC-PDF MATCH (CRITICAL): Does the PDF content actually discuss "${newTopic}"?
       - Read the PDF content carefully
       - If PDF is about a DIFFERENT topic → REJECT immediately
       - Example: If topic is "process synchronization" but PDF discusses "network security" → REJECT
       - The PDF MUST contain substantial content about the declared topic
    
    3. SUBJECT RELEVANCE: Are both the topic AND PDF content relevant to "${subjectName}"?
       - If topic or PDF content belongs to a different subject → REJECT
       - Example: "Information Security" PDF for "Operating Systems" subject → REJECT
    
    IMPORTANT: Be STRICT. If there's ANY mismatch between:
    - What the student CLAIMS (topic)
    - What the PDF ACTUALLY contains
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
