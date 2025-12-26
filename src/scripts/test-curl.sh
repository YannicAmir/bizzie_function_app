
#!/bin/bash
PROJECT_ID="bizzie-dev-7199b"
LOCATION="us-central1"
MODEL="gemini-3-flash-preview"
ACCESS_TOKEN=$(gcloud auth print-access-token)

echo "\n--- 3. Testing Generation (${MODEL} - v1beta1) ---"
curl -s -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Goog-User-Project: ${PROJECT_ID}" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [{ "text": "Hello" }]
    }]
  }' \
  "https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:streamGenerateContent"

echo "\n--- Done ---"
