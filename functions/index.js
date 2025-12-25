const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const pdfParse = require("pdf-parse");
const path = require("path");
const os = require("os");
const fs = require("fs");

admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

// SINGLE API KEY (User Provided) - No Load Balancing, No Backup
const GEMINI_API_KEY = "AIzaSyDzq92maQ0FA-tM4zBBCufEBlwBeXefVrA";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * Single Consolidated Function for File Upload
 * - Extracts Text
 * - Generates Summary & Questions (Immediately, Blocking-style for logic simplicity)
 * - Assigns Timeslot
 * - Merges PDF
 */
exports.onFileUpload = functions
    .runWith({ memory: "1GB", timeoutSeconds: 300 })
    .storage.object().onFinalize(async (object) => {
        const filePath = object.name;
        if (!filePath.startsWith("submissions/") || !filePath.endsWith("original.pdf")) {
            return null;
        }

        const submissionId = filePath.split("/")[1];
        console.log(`Processing submission: ${submissionId}`);

        const bucket = storage.bucket(object.bucket);
        await db.collection("submissions").doc(submissionId).update({ status: "processing" });

        try {
            // 1. Download PDF
            const tempFilePath = path.join(os.tmpdir(), "original.pdf");
            await bucket.file(filePath).download({ destination: tempFilePath });

            // 2. Extract Text
            const dataBuffer = fs.readFileSync(tempFilePath);
            const pdfData = await pdfParse(dataBuffer);
            const extractedText = pdfData.text;

            // 3. Gemini Call (Direct & Single)
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const prompt = `You are an academic evaluator.
Generate a concise 5–6 sentence summary of the following project report.
Then generate 5 viva questions a professor may ask based on the content.
Return the output in JSON format: { "summary": "...", "questions": ["q1", "q2"...] }

Project Text:
${extractedText.substring(0, 30000)}`;

            let summary = "Summary not generated.";
            let questions = [];

            try {
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();
                const jsonText = text.replace(/```json/g, "").replace(/```/g, "").trim();
                const json = JSON.parse(jsonText);
                summary = json.summary;
                questions = json.questions;
            } catch (e) {
                console.error("Gemini Error:", e);
                summary = "Error generating summary.";
            }

            // 4. Generate Front Page
            const subDoc = await db.collection("submissions").doc(submissionId).get();
            const subData = subDoc.data();

            let studentData = {};
            if (subData.studentId) {
                const sDoc = await db.collection("users").doc(subData.studentId).get();
                if (sDoc.exists) studentData = sDoc.data();
            }

            const frontPageBuffer = await generateFrontPagePDF(studentData, subData.subjectName || "Project Report");
            const originalPdfBytes = fs.readFileSync(tempFilePath);
            const mergedPdfBytes = await mergePDFs(frontPageBuffer, originalPdfBytes);

            // 5. Upload Merged
            const mergedFilePath = `submissions/${submissionId}/merged.pdf`;
            const mergedFile = bucket.file(mergedFilePath);
            await mergedFile.save(mergedPdfBytes, { contentType: 'application/pdf' });
            await mergedFile.makePublic();
            const mergedUrl = `https://storage.googleapis.com/${bucket.name}/${mergedFilePath}`;

            // 6. Assign Slot
            const timeSlot = await assignTimeSlot(subData.subjectId);

            // 7. Update Firestore
            await db.collection("submissions").doc(submissionId).update({
                summary,
                questions,
                mergedFilePath: mergedUrl,
                status: "processed",
                timeslot: timeSlot,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log("Submission processed successfully.");

        } catch (error) {
            console.error("Error processing submission:", error);
            await db.collection("submissions").doc(submissionId).update({ status: "error" });
        }
    });

async function generateFrontPagePDF(student, title) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const drawCenter = (text, y, size, f = font) => {
        const textWidth = f.widthOfTextAtSize(text, size);
        page.drawText(text, { x: (width - textWidth) / 2, y, size, font: f, color: rgb(0, 0, 0) });
    };
    drawCenter("ECO SUBMIT UNIVERSITY", height - 100, 24);
    drawCenter("DEPARTMENT OF " + (student.department || "ENGINEERING").toUpperCase(), height - 140, 16);
    drawCenter("A PROJECT REPORT", height - 250, 20);
    drawCenter("ON", height - 280, 14, regFont);
    drawCenter((title || "PROJECT").toUpperCase(), height - 310, 22);
    drawCenter("Submitted by", height - 400, 14, regFont);
    drawCenter(student.name || "Student Name", height - 430, 18);
    drawCenter("Roll No: " + (student.roll || "---"), height - 455, 14, regFont);
    drawCenter("Academic Year: 2024-2025", 100, 14);
    return await pdfDoc.save();
}

async function mergePDFs(frontPageBytes, originalBytes) {
    const pdfDoc = await PDFDocument.create();
    const coverDocs = await PDFDocument.load(frontPageBytes);
    const originalDocs = await PDFDocument.load(originalBytes);
    const [coverPage] = await pdfDoc.copyPages(coverDocs, [0]);
    pdfDoc.addPage(coverPage);
    const contentPages = await pdfDoc.copyPages(originalDocs, originalDocs.getPageIndices());
    contentPages.forEach((page) => pdfDoc.addPage(page));
    return await pdfDoc.save();
}

async function assignTimeSlot(subjectId) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
    return date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
