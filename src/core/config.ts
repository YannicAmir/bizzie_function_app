export const config = {
  location: process.env.LOCATION || 'us-central1',
  projectId: process.env.GCLOUD_PROJECT || process.env.PROJECT_ID || '',
  fmpApiKey: process.env.FMP_API_KEY || '',
};
