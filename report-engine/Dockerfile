FROM python:3.9-slim

# Install system dependencies
# pandoc for Docx->MD
# texlive-* for LaTeX->PDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    pandoc \
    texlive-latex-base \
    texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-latex-extra \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create workspace for temp files
RUN mkdir -p /workspace && chmod 777 /workspace

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
# Copy application code
COPY app/ ./app/

# Create serviceAccountKey.json from Environment Variable
# (Render will provide the content via GOOGLE_APPLICATION_CREDENTIALS_JSON env var)
ARG GOOGLE_APPLICATION_CREDENTIALS_JSON
# Use printf to handle escaped newlines (\n) correctly when writing the file
RUN printf "%s" "$GOOGLE_APPLICATION_CREDENTIALS_JSON" > serviceAccountKey.json

# Expose port
EXPOSE 8000

# Run commands
# Run commands (Shell form allows variable expansion for $PORT)
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
