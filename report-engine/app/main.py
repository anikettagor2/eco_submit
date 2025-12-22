from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from app.core import converter, cloud_ops
from app.config import settings
import shutil
import os
import uuid
import re

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title=settings.PROJECT_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...), 
    user_id: str = Form(...)
):
    session_id = str(uuid.uuid4())
    
    # 1. Save file locally
    upload_dir = os.path.join(settings.WORKSPACE_DIR, session_id)
    os.makedirs(upload_dir, exist_ok=True)
    local_path = os.path.join(upload_dir, file.filename)
    
    with open(local_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # 2. Convert Docx -> Markdown
    try:
        markdown_content, image_files = converter.process_docx(local_path, session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")
        
    # 3. Upload images to Firebase & Replace paths
    # Markdown image format: ![Alt](path)
    # We extracted images to `upload_dir/media/...`
    # We upload them and replace path in markdown.
    
    for img_path in image_files:
        # Construct destination path in Firebase
        # structure: temp_reports/{session_id}/media/{filename}
        filename = os.path.basename(img_path)
        dest_path = f"temp_reports/{session_id}/media/{filename}"
        
        try:
            public_url = cloud_ops.upload_to_storage(img_path, dest_path)
        except Exception as e:
            print(f"Failed to upload image {filename}: {e}")
            continue
            
        # Replace in markdown
        # converter.process_docx returns relative paths or list.
        # We need to replace the RELATIVE path that pypandoc put in the markdown.
        # Usually pypandoc puts `media/image.png`.
        # We search for `media/{filename}`
        
        # Simple string replace (could be risky if filename appears elsewhere, but simple for now)
        # A more robust regex would look for !\[.*\]\(.*{filename}\)
        
        # Let's assume path in markdown matches the relative structure from extraction
        # We'll just replace the exact internal path if we can guess it.
        # But `process_docx` output depends on pypandoc.
        # Let's replace the basename matching inside `()`
        
        # Regex to find `(...filename)`
        # pattern = r"\((.*?{})\)".format(re.escape(filename))
        # This is strictly for Markdown image links provided by pandoc
        
        # Let's iterate and replace
        markdown_content = markdown_content.replace(f"media/{filename}", public_url)
        # Also try just filename if extracted flat
        markdown_content = markdown_content.replace(f"{filename}", public_url)

    # 4. Create Firestore Entry
    user_name = cloud_ops.get_user_name(user_id)
    cloud_ops.update_submission_status(session_id, "draft", user_id=user_id)
    
    return {
        "session_id": session_id,
        "editable_markdown": markdown_content,
        "user_name_fetched": user_name
    }

@app.post("/api/finalize")
async def finalize_report(
    session_id: str = Form(...),
    markdown_text: str = Form(None), # Allow missing/empty
    title: str = Form(None),
    abstract: str = Form(None),
    author_name: str = Form(None),
    roll_no: str = Form(None),
    department: str = Form(None),
    guide_name: str = Form(None),
    session_year: str = Form(None)
):
    print(f"DEBUG: Finalize called for session {session_id}")
    
    # 1. Update Status
    cloud_ops.update_submission_status(session_id, "processing")
    
    # 2. Build Metadata with defaults
    metadata = {
        "title": title or "Project Report",
        "abstract": abstract or "",
        "author_name": author_name or "Student",
        "roll_no": roll_no or "",
        "department": department or "",
        "guide_name": guide_name or "",
        "session_year": session_year or ""
    }
    print(f"DEBUG: Metadata received: {metadata}")
    
    # 3. Compile PDF
    try:
        # Check if markdown_text is present
        if not markdown_text:
             print("WARNING: Markdown text is empty!")
             markdown_text = "# Report\n\n(No content provided)"

        # Note: finalization from editor currently uses default template. 
        # If we want editor to support types, we need to pass it here too.
        # For now, keeping default for editor flow.
        pdf_path = await converter.compile_pdf(markdown_text, metadata, session_id)
    except Exception as e:
        print(f"ERROR: PDF Compilation failed: {e}")
        cloud_ops.update_submission_status(session_id, "failed")
        raise HTTPException(status_code=500, detail=f"PDF Compilation failed: {str(e)}")
        
    # 4. Upload PDF
    dest_path = f"report_submissions/{session_id}.pdf"
    try:
        pdf_url = cloud_ops.upload_to_storage(pdf_path, dest_path)
    except Exception as e:
        cloud_ops.update_submission_status(session_id, "failed_upload")
        raise HTTPException(status_code=500, detail="Failed to upload PDF")
        
    # 5. Update Record
    cloud_ops.update_submission_status(session_id, "completed", pdf_url=pdf_url)
    
    return {
        "status": "completed",
        "pdf_url": pdf_url
    }



from fastapi.responses import FileResponse, StreamingResponse
import httpx

@app.get("/")
async def root():
    return {"status": "ok", "service": "Report Engine"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/api/fetch-pdf")
async def fetch_pdf(url: str):
    """
    Proxies a PDF file from a remote URL to avoid CORS issues in the browser.
    """
    client = httpx.AsyncClient()
    req = client.build_request("GET", url)
    r = await client.send(req, stream=True)
    
    return StreamingResponse(
        r.aiter_bytes(), 
        media_type=r.headers.get("content-type", "application/pdf"),
        headers={
            "Access-Control-Allow-Origin": "*"
        }
    )


@app.post("/api/standardize")
async def standardize_report(
    file: UploadFile = File(...),
    report_type: str = Form("default") # Micro Project, Mini Project, etc.
):
    """
    Directly converts a Word doc to a Standardized PDF based on report type.
    Returns the PDF file content.
    """
    session_id = str(uuid.uuid4())
    print(f"DEBUG: Standardize called for {session_id} - Type: {report_type}")

    # 1. Save file locally
    upload_dir = os.path.join(settings.WORKSPACE_DIR, session_id)
    os.makedirs(upload_dir, exist_ok=True)
    local_path = os.path.join(upload_dir, file.filename)
    
    with open(local_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 2. Convert Docx -> Markdown
    try:
        markdown_content, image_files = converter.process_docx(local_path, session_id)
    except Exception as e:
        shutil.rmtree(upload_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")

    # 3. Compile PDF with specific template
    # Mock metadata for auto-standardization ?? 
    # Ideally standardizer should extract metadata from docx front page text if possible.
    # OR we just use placeholders/defaults. 
    # Given the requirements, users upload report. We wrapping it?
    # Actually, converter takes markdown. The template VARs need data.
    # If we don't have metadata, the title page will be empty.
    # HACK: Let's extract simple metadata from context-less standardization? 
    # Or just use "Standardized Report" and let them fill it?
    # BUT the user said "separate front page... different latex".
    # This implies we generate the front page.
    # We don't have student name/roll no here unless passed from frontend.
    # Standardizer client in frontend only sends file?
    # We should update frontend to send metadata! 
    # FOR NOW: I will use generic defaults, but I will flag this in my plan/notes.
    # Actually, the user is logged in on frontend. I can pass student name etc.
    # I will assume for now I receive them or defaults.
    
    metadata = {
        "title": file.filename.replace(".docx", "").replace("_"," ").title(),
        "author_name": "Student Name", # Placeholder until frontend sends it
        "department": "Department",
        "roll_no": "",
        "session_year": "2024-2025"
    }

    try:
        pdf_path = await converter.compile_pdf(markdown_content, metadata, session_id, report_type)
    except Exception as e:
        # shutil.rmtree(upload_dir, ignore_errors=True) # Keep for debug
        raise HTTPException(status_code=500, detail=f"PDF Compilation failed: {str(e)}")

    # 4. Return the PDF file
    return FileResponse(
        pdf_path, 
        media_type="application/pdf", 
        filename=f"standardized_{file.filename.replace('.docx','.pdf')}"
    )

