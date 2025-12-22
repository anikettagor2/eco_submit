
import firebase_admin
from firebase_admin import credentials, storage

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)

candidates = [
    "devsprint-481102.appspot.com",
    "devsprint-481102.firebasestorage.app",
    "devsprint-481102",
    "staging.devsprint-481102.appspot.com"
]

print("Testing Buckets:")
for name in candidates:
    try:
        bucket = storage.bucket(name)
        if bucket.exists():
            print(f"✅ SUCCESS: {name} exists!")
        else:
             print(f"❌ FAIL: {name} does not exist.")
    except Exception as e:
        print(f"⚠️ ERROR testing {name}: {e}")
