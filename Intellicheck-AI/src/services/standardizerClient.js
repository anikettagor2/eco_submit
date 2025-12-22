/**
 * Service to interact with the Python Report Standardizer Microservice
 */

const getStandardizerUrl = () => {
    return import.meta.env.VITE_STANDARDIZER_URL;
};

/**
 * Standardizes a report file by sending it to the external microservice.
 * @param {File} fileBlob - The file object to standardize
 * @param {string} reportType - The type of report (e.g., "Micro Project", "Mini Project")
 * @returns {Promise<Blob>} - The standardized file/blob
 */
export const standardizeReport = async (fileBlob, reportType = "default") => {
    const url = getStandardizerUrl();

    if (!url) {
        console.warn("Standardizer URL not configured. Skipping standardization.");
        throw new Error("Standardizer URL missing");
    }

    const formData = new FormData();
    formData.append('file', fileBlob);
    formData.append('report_type', reportType);

    try {
        const response = await fetch(`${url}/api/standardize`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Standardization failed with status: ${response.status}`);
        }

        // Assuming the service returns the file blob directly
        const standardizedBlob = await response.blob();
        return standardizedBlob;
    } catch (error) {
        console.error("Standardization service error:", error);
        throw error;
    }
};
