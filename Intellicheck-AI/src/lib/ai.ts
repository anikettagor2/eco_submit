import { GoogleGenerativeAI } from "@google/generative-ai";
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker (Lazy Init)
const initPDFWorker = () => {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }
};

// API Key
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/**
 * Extracts text from a PDF URL (Client-Side).
 * Handles CORS by trying direct fetch first, then a proxy.
 */
async function extractTextFromPDF(url: string): Promise<string> {
    initPDFWorker();

    // Use local backend proxy to bypass CORS
    // The proxy endpoint is at http://localhost:8000/api/fetch-pdf?url=...
    const proxyUrl = `http://localhost:8000/api/fetch-pdf?url=${encodeURIComponent(url)}`;

    console.log(`Fetching PDF via proxy: ${proxyUrl}`);

    try {
        const loadingTask = pdfjsLib.getDocument(proxyUrl);
        const pdf = await loadingTask.promise;
        return await parsePdfPages(pdf);
    } catch (error: any) {
        console.error("PDF fetch failed even with proxy:", error);
        throw new Error("Could not read PDF. Ensure backend is running at localhost:8000.");
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

export const generateInsights = async (subjectName: string, studentName: string, pdfUrl: string, topicName?: string) => {
    if (!API_KEY) throw new Error("Missing Gemini API Key in .env");

    // 1. Extract Text
    console.log("Extracting text from PDF (Client-Side)...");
    const pdfText = await extractTextFromPDF(pdfUrl);
    if (!pdfText) throw new Error("PDF text is empty.");

    // 2. Call Gemini SDK (Single Model: gemini-1.5-flash)
    const prompt = `
    Analyze this student project report for subject "${subjectName}" by student "${studentName}".
    ${topicName ? `DECLARED TOPIC: "${topicName}".` : ""}
    
    PDF CONTENT:
    "${pdfText.substring(0, 30000)}" 
    
    OUTPUT REQUIREMENTS:
    1. SUMMARY: A concise summary (3-5 bullet points).
    2. QUESTIONS: Exactly 5 viva/technical questions.
    3. MARKS: Suggested marks out of 100 based on quality/depth. 
       ${topicName ? `IMPORTANT: Check if the content strictly matches the declared topic "${topicName}". If not, significantly penalize marks and state "Off-topic submission" in justification.` : ""}
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

    console.log("Calling Gemini SDK...");

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Clean JSON
    const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(jsonStr);
};

export const checkTopicSimilarity = async (newTopic: string, subjectName: string, existingTopics: string[], pdfUrl?: string) => {
    let pdfContext = "";
    if (pdfUrl) {
        try {
            console.log("Extracting text for topic verification...");
            const text = await extractTextFromPDF(pdfUrl);
            pdfContext = text.substring(0, 8000); // Check first ~8k characters
        } catch (e) {
            console.warn("Could not extract PDF text for topic check", e);
        }
    }

    const prompt = `
    Subject: "${subjectName}"
    Proposed Topic: "${newTopic}"
    Existing Topics: ${JSON.stringify(existingTopics)}
    ${pdfContext ? `PDF Content Start: "${pdfContext}"` : ""}

    Task:
    1. UNIQUENESS CHECK: Is "Proposed Topic" semantically unique from "Existing Topics"? 
    2. RELEVANCE CHECK: ${pdfContext ? `Does the provided "PDF Content" matches the "Proposed Topic"?` : "Skip (No PDF provided)."}
    3. SUBJECT CONTEXT CHECK: is the "Proposed Topic" and "PDF Content" valid and relevant for the academic Subject "${subjectName}"? (e.g. A "Biology" paper is invalid for a "Data Structures" subject).

    Rules:
    - If Topic is duplicate/similar -> isUnique: false, message: "Topic overlaps with existing project: [Name]"
    - If Content is irrelevant to Topic -> isUnique: false, message: "Content Mismatch: The document appears to be about [Detected Topic] instead of [Proposed Topic]. Reason: [Brief Explanation]."
    - If Unrelated to Subject -> isUnique: false, message: "Subject Mismatch: This topic does not belong to the subject '${subjectName}'. Please choose a valid topic."
    - If Valid -> isUnique: true, message: "Topic is unique, matching, and relevant to the subject."

    Return STRICT JSON ONLY:
    {
        "isUnique": boolean,
        "message": "...",
        "suggestions": ["Idea 1", "Idea 2", "Idea 3"] (Only if rejected)
    }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(jsonStr);
};
