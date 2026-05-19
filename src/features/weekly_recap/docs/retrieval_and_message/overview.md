# Weekly Recap — Retrieval and Message Pipeline

## Purpose
Reads the LLM-generated weekly summaries stored by the storage pipeline and delivers them to the relevant users.

> **Note:** This document is a placeholder. The full flow diagram for this sub-feature is pending. It will be filled in once the diagram is provided.

## Planned Responsibilities
- Query Firestore for stored `LLMResponse` documents matching each user's watchlist.
- Format the short/long summaries into a user-facing message.
- Deliver the message via the appropriate channel (push notification, email, in-app, etc.).

## Upstream Dependency
Depends on the storage pipeline having written `weekly_recap/{ticker}/summaries/{weekEndDate}` documents to Firestore before this pipeline runs.
