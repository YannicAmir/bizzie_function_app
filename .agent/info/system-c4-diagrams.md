---
description: C4 Container diagrams visualizing the Bizzie System Architecture.
---
# Bizzie System Architecture - C4 Diagrams

## System Context & Containers

This diagram visualizes how the Bizzie Mobile App interacts with the Backend (Function App), Firebase, and Google Cloud services.

```mermaid
C4Container
    title Container Diagram for Bizzie System

    Person(user, "App User", "A user of the Bizzie mobile application")

    System_Boundary(bizzie_system, "Bizzie Ecosystem") {
        Container(mobile_app, "Bizzie Mobile App", "Flutter", "The interface for users on iOS/Android")
        
        Container(function_app, "Bizzie Function App", "Node.js / TypeScript", "Serverless backend logic for triggers and scheduled tasks")
        
        ContainerDb(firestore, "Firestore", "NoSQL Database", "Stores user profiles, brands, and app content")
        Container(remote_config, "Remote Config", "Firebase", "Feature flags and configuration values")
        Container(auth, "Firebase Auth", "Firebase", "Handles user authentication")
    }

    System_Boundary(gcp, "Google Cloud Platform") {
        Container(scheduler, "Cloud Scheduler", "GCP", "Triggers timed jobs (e.g., Daily Brands)")
        Container(vertex_ai, "Vertex AI", "Gemini 1.5", "Generates AI content")
        Container(logging, "Cloud Logging", "GCP", "Stores structured logs from the Function App")
    }

    Rel(user, mobile_app, "Uses", "Touch Interface")
    
    Rel(mobile_app, auth, "Authenticates with", "SDK")
    Rel(mobile_app, firestore, "Reads/Writes data", "SDK (Realtime)")
    Rel(mobile_app, remote_config, "Fetches config", "SDK")

    Rel(scheduler, function_app, "Triggers", "HTTPS / PubSub")
    
    Rel(function_app, firestore, "Reads/Writes", "Admin SDK")
    Rel(function_app, vertex_ai, "Generates content via", "Vertex AI SDK")
    Rel(function_app, logging, "Writes logs to", "Logger SDK")
    Rel(function_app, remote_config, "Reads config from", "Admin SDK")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

## Detailed Data Flow (Daily Brands Example)

```mermaid
sequenceDiagram
    participant Scheduler as Cloud Scheduler
    participant Function as Function App (Trigger -> UseCase)
    participant AI as Vertex AI (Gemini)
    participant DB as Firestore
    participant App as Mobile App

    Note over Scheduler, App: 8:00 AM Daily Job
    Scheduler->>Function: Trigger "Daily Brands"
    activate Function
    Function->>AI: Request Brand Content
    activate AI
    AI-->>Function: Return JSON Content
    deactivate AI
    Function->>DB: Save to 'daily_brands' collection
    activate DB
    DB-->>Function: Success
    deactivate DB
    Function-->>Scheduler: Job Complete
    deactivate Function
    
    Note over DB, App: Realtime Sync
    DB->>App: Update UI with new Brands
```

## How to View These Diagrams

The code blocks above use **Mermaid.js**, a tool that turns text into diagrams. You have two ways to view them:

1.  **In Antigravity**:
    *   Open the **Command Palette** (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows).
    *   Type **"Markdown: Open Preview to the Side"** and select it.
    *   Alternatively, look for the **Open Preview to the Side** icon (a document with a magnifying glass) in the editor's top-right toolbar.

2.  **Online**:
    *   Go to the [Mermaid Live Editor](https://mermaid.live/).
    *   Copy the code inside the `mermaid` block (between the backticks).
    *   Paste it into the left side of the editor.
    *   You will see the visual diagram on the right. You can even download it as an Image (PNG/SVG).
