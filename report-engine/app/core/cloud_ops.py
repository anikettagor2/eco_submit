import firebase_admin
from firebase_admin import credentials, storage, firestore
from app.config import settings
import os
import datetime

# Initialize Firebase Admin
try:
    cred = credentials.Certificate('serviceAccountKey.json')
    firebase_admin.initialize_app(cred, {
        'storageBucket': settings.FIREBASE_STORAGE_BUCKET
    })
    db = firestore.client()
    bucket = storage.bucket()
except Exception as e:
    print(f"Warning: Firebase initialization failed. Ensure serviceAccountKey.json is present. Error: {e}")
    # In production, we might want to raise this error, but for build process we allow it to pass 
    # if the file is missing (e.g. during docker build before mounting).
    db = None
    bucket = None

def get_user_name(user_id: str) -> str:
    """Fetches user name from 'users' collection."""
    if not db:
        return "Unknown Student"
    try:
        doc = db.collection(settings.FIRESTORE_USERS_COLLECTION).document(user_id).get()
        if doc.exists:
            data = doc.to_dict()
            return data.get('name', "Unknown Student")
    except Exception as e:
        print(f"Error fetching user: {e}")
    return "Unknown Student"

def upload_to_storage(local_path: str, destination_path: str) -> str:
    """Uploads file to Firebase Storage and returns public URL."""
    if not bucket:
        raise Exception("Firebase Storage not initialized")
    
    blob = bucket.blob(destination_path)
    blob.upload_from_filename(local_path)
    blob.make_public()
    return blob.public_url

def update_submission_status(session_id: str, status: str, pdf_url: str = None, user_id: str = None):
    """Updates the submission document in Firestore 'report_submissions'."""
    if not db:
        print(f"Skipping Firestore update (No DB): {session_id} -> {status}")
        return

    doc_ref = db.collection(settings.FIRESTORE_SUBMISSIONS_COLLECTION).document(session_id)
    
    update_data = {
        "status": status,
        "updated_at": datetime.datetime.utcnow()
    }
    if pdf_url:
        update_data["pdf_url"] = pdf_url
    if user_id:
        update_data["user_id"] = user_id
    
    # Use set with merge=True to create if not exists or update
    doc_ref.set(update_data, merge=True)
