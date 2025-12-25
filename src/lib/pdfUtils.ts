import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import html2canvas from 'html2canvas';

export const addReviewStampToPDF = async (
    pdfBytes: ArrayBuffer,
    stampData: {
        professorName: string;
        collegeName: string;
        logoUrl?: string;
        date: string;
        templateSettings?: any; // New field for page 4
        subData?: any; // Data for replacing variables in page 4
    }
): Promise<Uint8Array> => {
    try {
        // --- 1. Generate Page 4 if exists ---
        /*
           DISABLED BY USER REQUEST (Step 510) - Temporarily removing merging logic while keeping template in Admin Dashboard.
           
        let page4ImageBytes: Uint8Array | null = null;
        if (stampData.templateSettings?.htmlPage4) {
            try {
                const container = document.createElement('div');
                container.style.position = 'fixed';
                container.style.top = '-10000px';
                container.style.left = '-10000px';
                container.style.zIndex = '-100';
                document.body.appendChild(container);

                let processedHtml = stampData.templateSettings.htmlPage4;
                if (stampData.subData) {
                    Object.entries(stampData.subData).forEach(([key, val]) => {
                        processedHtml = processedHtml.replace(new RegExp(`{{${key}}}`, 'g'), (val as string) || "");
                    });
                }

                const pageWrapper = document.createElement('div');
                pageWrapper.innerHTML = `<style>
                    .template-page { 
                        position: relative;
                        width: 210mm; 
                        height: 297mm; 
                        margin: 0;
                        padding: 0; 
                        background: white; 
                        font-family: 'Times New Roman', serif; 
                        box-sizing: border-box;
                        color: black;
                        overflow: hidden;
                    }
                    .template-page * { box-sizing: border-box; }
                    .template-page img { max-width: 100%; }
                </style><div class="template-page">${processedHtml}</div>`;

                container.appendChild(pageWrapper);

                const canvas = await html2canvas(pageWrapper.querySelector('.template-page') as HTMLElement, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff'
                });

                const dataUrl = canvas.toDataURL('image/png');
                page4ImageBytes = await fetch(dataUrl).then(res => res.arrayBuffer()).then(buffer => new Uint8Array(buffer));

                document.body.removeChild(container);
            } catch (err) {
                console.error("Failed to generate Page 4", err);
            }
        }
        */

        const pdfDoc = await PDFDocument.load(pdfBytes);
        const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const helveticaSmall = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // Load Logo if available
        let logoImage;
        if (stampData.logoUrl) {
            try {
                const response = await fetch(stampData.logoUrl);
                if (response.ok) {
                    const logoBytes = await response.arrayBuffer();
                    // Try embedding as PNG first, then JPG
                    try {
                        logoImage = await pdfDoc.embedPng(logoBytes);
                    } catch {
                        logoImage = await pdfDoc.embedJpg(logoBytes);
                    }
                } else {
                    console.warn(`Failed to fetch logo: ${response.statusText}`);
                }
            } catch (e) {
                console.warn("Failed to load logo for stamp", e);
            }
        }

        // --- STAMP ORIGINAL PAGES FIRST ---
        const pages = pdfDoc.getPages();

        for (const page of pages) {
            const { width, height } = page.getSize();

            // Define Stamp Area (Bottom Right)
            // Ensure width is sufficient
            if (width < 200 || height < 100) continue;

            const stampWidth = 180;
            const stampHeight = 60;
            const x = width - stampWidth - 25; // Slightly more padding
            const y = 25;

            // Draw Background Box
            try {
                page.drawRectangle({
                    x: x - 5,
                    y: y - 5,
                    width: stampWidth + 10,
                    height: stampHeight + 10,
                    color: rgb(1, 1, 1),
                    opacity: 0.95,
                    borderColor: rgb(0, 0.5, 0), // Green border
                    borderWidth: 1.5,
                });

                // Draw Logo
                if (logoImage) {
                    const maxLogoH = 40;
                    const scaleFactor = maxLogoH / logoImage.height;
                    const logoW = logoImage.width * scaleFactor;

                    page.drawImage(logoImage, {
                        x: x + 5,
                        y: y + 10,
                        width: logoW,
                        height: maxLogoH,
                    });
                }

                const textX = x + 60; // Offset for text

                // Draw Text
                page.drawText(stampData.collegeName.substring(0, 40), { // Truncate if too long
                    x: textX,
                    y: y + 38,
                    size: 9,
                    font: helveticaFont,
                    color: rgb(0, 0, 0),
                });

                page.drawText(`Reviewed By: ${stampData.professorName}`, {
                    x: textX,
                    y: y + 24,
                    size: 8,
                    font: helveticaSmall,
                    color: rgb(0, 0.4, 0), // Dark Green
                });

                page.drawText(`Date: ${stampData.date}`, {
                    x: textX,
                    y: y + 10,
                    size: 7,
                    font: helveticaSmall,
                    color: rgb(0.4, 0.4, 0.4),
                });

                // "Verified" Icon/Text Watermark
                page.drawText("VERIFIED", {
                    x: x + stampWidth - 50,
                    y: y + 20,
                    size: 14,
                    font: helveticaFont,
                    color: rgb(0, 0.6, 0),
                    rotate: degrees(15),
                    opacity: 0.2
                });
            } catch (drawErr) {
                console.error("Error drawing on page", drawErr);
            }
        }

        // --- 2. Append Page 4 if generated (AFTER Stamping) ---
        /*
        if (page4ImageBytes) {
            const img = await pdfDoc.embedPng(page4ImageBytes);
            const page = pdfDoc.addPage([595.28, 841.89]); // A4 Size
            page.drawImage(img, {
                x: 0,
                y: 0,
                width: 595.28,
                height: 841.89
            });
        }
        */

        return await pdfDoc.save();
    } catch (e) {
        console.error("Failed to add stamp to PDF - Returning original", e);
        return new Uint8Array(pdfBytes);
    }
};

interface CoverPageData {
    name: string;
    rollNo: string;
    department: string;
    sessionYear: string;
    subjectName: string;
    subjectCode?: string;
    professorName?: string;
    topic?: string;
    submissionType: string;
}

// We interpret "don't give those cover style options" as removing the style argument.
export const addCoverPageToPDF = async (
    originalBytes: ArrayBuffer,
    data: CoverPageData,
    templateSettings: any = {},
    // Optional style arg kept for backward compat but ignored if HTML settings exist
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _style: any = 'classic'
): Promise<Uint8Array> => {
    try {
        const { htmlPage1, htmlPage2, htmlPage3 } = templateSettings;

        // If no HTML configured, return original
        if (!htmlPage1 && !htmlPage2 && !htmlPage3) {
            console.warn("No HTML templates found in settings. Returning original.");
            return new Uint8Array(originalBytes);
        }

        const pages = [htmlPage1, htmlPage2, htmlPage3].filter(Boolean);
        const images: string[] = [];

        // 1. Create a Hidden Container for Rendering
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '-10000px';
        container.style.left = '-10000px';
        container.style.zIndex = '-100'; // Ensure it's behind everything
        document.body.appendChild(container);

        try {
            for (const html of pages) {
                // 2. Inject Data
                let processedHtml = html;
                Object.entries(data).forEach(([key, val]) => {
                    processedHtml = processedHtml.replace(new RegExp(`{{${key}}}`, 'g'), val || "");
                });

                // 3. Render Helper Wrapper
                const pageWrapper = document.createElement('div');
                // A4 dimensions at 96 DPI is approx 794x1123, but for high res PDF we want higher scale. 
                // We'll set a standard width/height and let html2canvas scale it.
                // CSS wrapper to match the preview style
                pageWrapper.innerHTML = `<style>
                    .template-page { 
                        position: relative;
                        width: 210mm; 
                        height: 297mm; 
                        margin: 0;
                        padding: 0; 
                        background: white; 
                        font-family: 'Times New Roman', serif; 
                        box-sizing: border-box;
                        color: black;
                        overflow: hidden;
                    }
                    /* Reset default margins for body/html in case they leak */
                    .template-page * { box-sizing: border-box; }
                    
                    /* Utilities (optional support) */
                    .template-page img { max-width: 100%; }
                </style><div class="template-page">${processedHtml}</div>`;

                container.appendChild(pageWrapper);

                // 4. Capture
                const canvas = await html2canvas(pageWrapper.querySelector('.template-page') as HTMLElement, {
                    scale: 2, // Higher scale for better quality
                    useCORS: true, // For external images
                    logging: false,
                    backgroundColor: '#ffffff'
                });

                images.push(canvas.toDataURL('image/png'));
                container.removeChild(pageWrapper);
            }
        } finally {
            document.body.removeChild(container);
        }

        // 5. Merge into PDF
        const pdfDoc = await PDFDocument.load(originalBytes);

        // Insert in reverse order (3, 2, 1) at index 0 so they end up as 1, 2, 3
        for (let i = images.length - 1; i >= 0; i--) {
            const imgBytes = await fetch(images[i]).then(res => res.arrayBuffer());
            const img = await pdfDoc.embedPng(imgBytes);

            // A4 Size in PDF points (approx 595 x 842)
            // We want to fit the image to the page. 
            const page = pdfDoc.insertPage(0, [595.28, 841.89]);
            page.drawImage(img, {
                x: 0,
                y: 0,
                width: 595.28,
                height: 841.89
            });
        }

        return await pdfDoc.save();

    } catch (err) {
        console.error("HTML Cover Generation Failed", err);
        return new Uint8Array(originalBytes);
    }
};

// Export Type for compatibility (even if unused)
export type CoverPageStyle = 'classic' | 'modern' | 'creative';
