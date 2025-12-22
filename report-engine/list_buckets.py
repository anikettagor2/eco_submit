
import firebase_admin
from firebase_admin import credentials, storage

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)

from google.cloud import storage as gcs
client = gcs.Client.from_service_account_json("serviceAccountKey.json")

print("Listing Buckets:")
for bucket in client.list_buckets():
    print(f" - {bucket.name}")
