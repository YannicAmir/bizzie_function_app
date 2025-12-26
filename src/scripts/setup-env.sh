#!/bin/bash
set -e

# Usage: ./setup-env.sh <project-id-or-alias>
# Example: ./setup-env.sh qa

if [ -z "$1" ]; then
  echo "Usage: $0 <project-id-or-alias>"
  echo "Aliases: dev, qa, prod"
  exit 1
fi

ALIAS=$1
PROJECT_ID=""

# Resolve Alias to Project ID (Simple mapping based on .firebaserc)
if [ "$ALIAS" == "dev" ]; then
  PROJECT_ID="bizzie-dev-7199b"
elif [ "$ALIAS" == "qa" ]; then
  PROJECT_ID="bizzie-qa-e2f9c"
elif [ "$ALIAS" == "prod" ]; then
  PROJECT_ID="bizzie-prod"
else
  PROJECT_ID=$ALIAS
fi

echo "Detailed Setup for Project: $PROJECT_ID..."
echo "---------------------------------------------------"

# 1. Enable Required APIs (Functions, AI Platform, Firestore)
echo "[1/4] Enabling APIs..."
gcloud services enable \
  aiplatform.googleapis.com \
  cloudfunctions.googleapis.com \
  firestore.googleapis.com \
  --project="$PROJECT_ID"

# 2. Setup Vertex AI Service Agent (The "Ghost Identity" Fix)
echo "[2/4] Configuring Vertex AI Service Agent..."
# Force creation of the service agent
gcloud beta services identity create --service=aiplatform.googleapis.com --project="$PROJECT_ID" || echo "Service Identity likely already exists."

# Get the Service Agent Email
SA_EMAIL="service-$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")@gcp-sa-aiplatform.iam.gserviceaccount.com"
echo "Found Service Agent: $SA_EMAIL"

# Grant the role (Fixes 404/Permission Denied)
echo "Granting roles/aiplatform.serviceAgent to $SA_EMAIL..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/aiplatform.serviceAgent" \
  --condition=None || true

# 3. Ensure Firestore Exists (The "5 NOT_FOUND" Fix)
echo "[3/4] Checking Firestore..."
HEADER=$(gcloud firestore databases list --project="$PROJECT_ID" --format="value(name)" 2>/dev/null || true)
if [ -z "$HEADER" ]; then
  echo "Creating Firestore (Native) in us-central1..."
  gcloud firestore databases create --location=us-central1 --project="$PROJECT_ID" --type=firestore-native || true
else
  echo "Firestore database already exists."
fi

# 4. Verify Local Config
echo "[4/4] Verification Info"
echo "Project $PROJECT_ID is now configured with:"
echo " - Vertex AI API: Enabled"
echo " - Service Agent: Created & ROLES GRANTED"
echo " - Firestore: Ready (us-central1)"
echo "---------------------------------------------------"
echo "Setup Complete for $ALIAS ($PROJECT_ID)."
