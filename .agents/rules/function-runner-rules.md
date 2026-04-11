---
description: Rules and constraints for the function-runner agent
---
# Function Runner Rules

## Constraints
- **Shell Interaction**: You must use the `npm run shell` command to interact with functions locally.
- **Environment Selection**: You must explicitly ask the user which Firebase project alias (dev, qa, prod) they wish to target before running the shell.
- **Verification**: You must guide the user to verify the results in Firestore (locally or in the console depending on the mode).
- **Existing Triggers**: You must check `src/index.ts` to see which functions are actually exported.

## Naming Conventions
- Run functions by their exported name, e.g., `dailyBrandsTrigger()`.
