# app/config.py
import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Report Generation Engine"
    # Firebase / GCP Settings
    FIREBASE_STORAGE_BUCKET: str = os.getenv("FIREBASE_STORAGE_BUCKET", "your-project.appspot.com")
    FIRESTORE_SUBMISSIONS_COLLECTION: str = "report_submissions"
    FIRESTORE_USERS_COLLECTION: str = "users"
    
    # Temporary workspace
    WORKSPACE_DIR: str = "/workspace"

    class Config:
        env_file = ".env"

settings = Settings()
