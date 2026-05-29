# Memory Index

- [LangSmith callbacks background fix](feedback_langsmith_callbacks_background.md) — `LANGCHAIN_CALLBACKS_BACKGROUND=false` required for LangSmith traces in serverless; without it patchRun is dropped due to p-queue race condition
- [.env.local sourcing](feedback_env_local_sourcing.md) — `.env.local` is not auto-exported to shell; use `set -a && source .env.local && set +a` before running node scripts that need those vars
- [defineSecret for weekly_recap secrets](feedback_define_secret.md) — All secrets in `src/features/weekly_recap` must use `defineSecret`; pass `.value()` from trigger into services; do not change other features
