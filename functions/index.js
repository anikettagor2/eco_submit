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

// Initialize Gemini
// Note: In production, use functions.config().gemini.key or Secret Manager
// For MVP, we'll try to use process.env or a placeholder that the user must replace
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

exports.onFileUpload = functions.storage.object().onFinalize(async (object) => {
    const filePath = object.name;
    // Check if this is a submission original file
    // Path: submissions/{submissionId}/original.pdf
    if (!filePath.startsWith("submissions/") || !filePath.endsWith("original.pdf")) {
        console.log("Not a submission file, skipping.");
        return null;
    }

    const submissionId = filePath.split("/")[1];
    console.log(`Processing submission: ${submissionId}`);

    const bucket = storage.bucket(object.bucket);
    await db.collection("submissions").doc(submissionId).update({ status: "processed" }); // temporary update to trigger UI

    try {
        // 1. Download PDF
        const tempFilePath = path.join(os.tmpdir(), "original.pdf");
        await bucket.file(filePath).download({ destination: tempFilePath });

        // 2. Extract Text
        const dataBuffer = fs.readFileSync(tempFilePath);
        const pdfData = await pdfParse(dataBuffer);
        const extractedText = pdfData.text;

        // 3. Gemini Summary & Questions
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const prompt = `You are an academic evaluator.
Generate a concise 5–6 sentence summary of the following project report.
Then generate 5 viva questions a professor may ask based on the content.
Return the output in JSON format: { "summary": "...", "questions": ["q1", "q2"...] }

Project Text:
${extractedText.substring(0, 30000)} (truncated)`; // Limit text length

        let summary = "Summary not generated.";
        let questions = [];

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Clean markdown json if present
            const jsonText = text.replace(/```json/g, "").replace(/```/g, "").trim();
            const json = JSON.parse(jsonText);
            summary = json.summary;
            questions = json.questions;
        } catch (e) {
            console.error("Gemini Error:", e);
            summary = "Error generating summary.";
        }

        // 4. Generate Front Page (Simulating LaTeX with pdf-lib)
        const subDoc = await db.collection("submissions").doc(submissionId).get();
        const subData = subDoc.data();

        let studentData = {};
        if (subData.studentId) {
            const sDoc = await db.collection("users").doc(subData.studentId).get();
            if (sDoc.exists) studentData = sDoc.data();
        }

        const frontPageBuffer = await generateFrontPagePDF(studentData, "Project Report");

        // 5. Merge PDFs
        const originalPdfBytes = fs.readFileSync(tempFilePath);
        const mergedPdfBytes = await mergePDFs(frontPageBuffer, originalPdfBytes);

        // 6. Upload Merged PDF
        const mergedFilePath = `submissions/${submissionId}/merged.pdf`;
        const mergedFile = bucket.file(mergedFilePath);
        await mergedFile.save(mergedPdfBytes, { contentType: 'application/pdf' });

        // make public for mvp simplicity or get signed url
        await mergedFile.makePublic();
        const mergedUrl = `https://storage.googleapis.com/${bucket.name}/${mergedFilePath}`;

        // 7. Assign Time Slot
        const timeSlot = await assignTimeSlot(subData.subjectId);

        // 8. Update Firestore
        await db.collection("submissions").doc(submissionId).update({
            summary,
            questions,
            mergedFilePath: mergedUrl, // Storing URL for easier frontend access
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
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
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

    drawCenter("Under the Guidance of", height - 550, 14, regFont);
    drawCenter("Prof. Guide Name", height - 580, 18);

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
    // Simple logic: Query last allocated slot for this subject and add 15 mins
    // For MVP, we don't have a transaction, just query.
    const submissions = await db.collection("submissions")
        .where("subjectId", "==", subjectId)
        .where("status", "in", ["processed", "signed", "evaluated"])
        .orderBy("timeslot", "desc")
        .limit(1)
        .get();

    let nextSlotTime;

    if (submissions.empty || !submissions.docs[0].data().timeslot) {
        // Start date: tomorrow 10:00 AM
        const date = new Date();
        date.setDate(date.getDate() + 1);
        date.setHours(10, 0, 0, 0);
        nextSlotTime = date;
    } else {
        const lastSlotStr = submissions.docs[0].data().timeslot;
        // Parse string "Day 10:00 AM" or similar?
        // Using real Date object is better.
        // But for MVP display, let's store string formatted, but calculating using Date.
        // Assume format is reliable or we store a timestamp field too.
        // Let's restart logic: Always calculate from a base date.
        // But simpler: just pick a random time or deterministic sequence?
        // Let's return a string based on Count.

        // Better: Count submissions for subject
        const allSubs = await db.collection("submissions").where("subjectId", "==", subjectId).get();
        const count = allSubs.size; // This helps

        const startHour = 10;
        const slotsPerHour = 4; // 15 mins
        const dayOffset = Math.floor(count / (6 * 4)); // 6 working hours per day?
        const slotIndex = count % (6 * 4); // slot within day

        const date = new Date();
        date.setDate(date.getDate() + 1 + dayOffset);

        const hour = startHour + Math.floor(slotIndex / 4);
        const min = (slotIndex % 4) * 15;

        // Skip lunch 13:00-14:00
        let displayHour = hour;
        if (displayHour >= 13) displayHour += 1;

        date.setHours(displayHour, min, 0, 0);

        return date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    return nextSlotTime.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
