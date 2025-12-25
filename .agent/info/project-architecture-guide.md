---
description: A beginner-friendly guide to the Bizzie Function App architecture and workflow.
---
# Bizzie Function App Architecture Guide

## What is this "Function App"?

Think of `bizzie_function_app` as the **Backend Brain** for your mobile app. While your mobile app lives on the user's phone, this code lives in Google's Cloud.

It is "Serverless", which means you don't keep a computer running 24/7. Instead, these functions just "wake up" when something happens, do their job, and go back to sleep. This is cheaper and easier to manage.

## Connection to Bizzie Environments (Dev / QA / Prod)

You have 3 environments. This one codebase handles all of them.

### 1. The "Configuration" Magic
The file `src/core/config.ts` handles the environment awareness.
*   If you deploy this code to the **Bizzie Dev** project, Google tells the code: "You are in Dev".
*   If you deploy to **Bizzie Prod**, Google tells the code: "You are in Prod".

This allows us to write the code **once**, but have it behave correctly (e.g., "Use the Dev Database" vs "Use the Real Database") automatically.

### 2. How the Mobile App interacts
Your mobile app and this backend usually "talk" in two ways:
*   **Triggers**: Your app saves data to Firestore (e.g., "User created profile"). This Function App "wakes up" because it was watching that data, and maybe sends a Welcome Email.
*   **Scheduled Jobs**: This depends totally on the Function App. For example, every morning at 8 AM, a function wakes up, asks Gemini for "Daily Brands", and saves them to the database. Your mobile app simply displays whatever is in the database.

## Code Structure: Clean Architecture

We are using a **"Clean Architecture"**. This just means we organize files by **what they do**, not just what type of file they are.

Imagine we built a feature called `daily_brands`. It would have 3 distinct layers:

### 1. The Trigger (`trigger.ts`)
*   **Role**: The Receptionist.
*   **What it does**: This is the *only* part that talks to Google Cloud. It says "I am a Scheduler for 8 AM" or "I am an HTTP request".
*   **Analogy**: It picks up the phone. It doesn't solve the problem; it just writes down the request and hands it to the Manager.

### 2. The Use Case (`usecase.ts`)
*   **Role**: The Manager (The Brain).
*   **What it does**: This is where your business logic lives. It doesn't know about Google Cloud or HTTP. It just knows: "Step 1: Get data. Step 2: Calculate. Step 3: Save."
*   **Why?**: This makes it easy to test. We can test the logic without needing to actually deploy to the cloud.

### 3. The Services (`services/`)
*   **Role**: The Workers.
*   **What it does**: The Manager (Use Case) asks the Workers to do the heavy lifting safely.
    *   `vertex_ai.ts`: "Hello Gemini, please generate this text."
    *   `firestore.ts`: "Please save this to the database."
*   **Analogy**: The Manager says "Send an email". The Worker knows *how* to connect to the email server, log in, and send it.

## Example Flow: Daily Brands

1.  **Google Cloud Scheduler** hits 8:00 AM.
2.  **`trigger.ts`** wakes up. "Oh, it's 8 AM. Run the Daily Brands logic!"
3.  **`usecase.ts`** starts. "Okay, first I need to generate content. AI Service, go!"
4.  **`services/vertex_ai.ts`** calls Gemini and gets the text.
5.  **`usecase.ts`** receives text. "Great. Now Firestoe Service, save this."
6.  **`services/firestore.ts`** saves the data to the **Bizzie Dev/Prod** database (depending on where it's running).
7.  **Your Mobile App** updates because it was listening to that database.
