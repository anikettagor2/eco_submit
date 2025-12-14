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
    try {
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        return await parsePdfPages(pdf);
    } catch (error: any) {
        console.warn("Direct PDF fetch failed (CORS?), switching to proxy...", error);
        try {
            // Hackathon-friendly proxy to bypass localhost CORS issues
            const proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
            initPDFWorker();
            const loadingTask = pdfjsLib.getDocument(proxyUrl);
            const pdf = await loadingTask.promise;
            return await parsePdfPages(pdf);
        } catch (proxyError) {
            console.error("Proxy fetch failed:", proxyError);
            throw new Error("Could not read PDF. Ensure file is public or CORS is configured.");
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

export const generateInsights = async (subjectName: string, studentName: string, pdfUrl: string) => {
    if (!API_KEY) throw new Error("Missing Gemini API Key in .env");

    // 1. Extract Text
    console.log("Extracting text from PDF (Client-Side)...");
    const pdfText = await extractTextFromPDF(pdfUrl);
    if (!pdfText) throw new Error("PDF text is empty.");

    // 2. Call Gemini SDK (Single Model: gemini-1.5-flash)
    const prompt = `
    Analyze this student project report for subject "${subjectName}" by student "${studentName}".
    
    PDF CONTENT:
    "${pdfText.substring(0, 30000)}" 
    
    OUTPUT REQUIREMENTS:
    1. SUMMARY: A concise summary (3-5 bullet points).
    2. QUESTIONS: Exactly 5 viva/technical questions.
    3. MARKS: Suggested marks out of 100 based on quality/depth.
    4. JUSTIFICATION: A 1-sentence reason for the marks.

    Return STRICT JSON ONLY:
    {
        "summary": ["point 1", "point 2", ...],
        "questions": ["q1", "q2", "q3", "q4", "q5"],
        "suggested_marks": 75,
        "justification": "..."
    }
    `;

    console.log("Calling Gemini 1.5 Flash (SDK)...");

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Clean JSON
    const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(jsonStr);
};
