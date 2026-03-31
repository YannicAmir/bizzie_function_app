# Manual Setup Steps for Bizzie Function App

1.  **Firebase Login**
    Ensure you are logged in to Firebase CLI:
    ```bash
    firebase login
    ```

2.  **GCloud Login**
    Ensure you are logged in to Google Cloud SDK:
    ```bash
    gcloud auth login
    ```

3.  **Configure Project Aliases (One-Time)**
    Since you have existing projects, link them to short names:
    ```bash
    # Run these once to map the names
    firebase use --add {YOUR_DEV_PROJECT_ID} --alias dev
    firebase use --add {YOUR_QA_PROJECT_ID} --alias qa
    firebase use --add {YOUR_PROD_PROJECT_ID} --alias prod
    ```

4.  **Switch Environments**
    When you want to deploy, switch contexts easily:
    ```bash
    firebase use dev   # Ready to deploy to Bizzie Dev
    firebase use prod  # Ready to deploy to Bizzie Prod
    ```

5.  **Connect to GitHub**
    After running the setup workflow, your local repo is initialized.

    **Option A: Using GitHub Desktop (Recommended)**
    1.  Open GitHub Desktop.
    2.  Go to **File** > **Add Local Repository**.
    3.  Select the `bizzie-function-app` folder.
    4.  Click **Add Repository**.
    5.  Click **Publish repository** in the toolbar.
    6.  Select "GitHub.com", uncheck "Keep this code private" (if public), and click **Publish Repository**.

    **Option B: Using Command Line**
    *   Create a new **empty** repository on GitHub.
    *   Run:
        ```bash
        git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
        git branch -M main
        git push -u origin main
        ```
