# Bizzie Function App

## Project Identity
- **Name:** Bizzie Function App
- **Environments:** `dev` | `qa` | `prod`
- **Runtime:** Node.js 20, TypeScript 5.x (strict mode)
- **Platform:** Google Cloud Functions (2nd Gen)
- **Package manager:** npm

## Commands
- `npm run build` — compile TypeScript
- `npm test` — run Jest tests
- `npm run lint` — ESLint
- `npm run shell` — interactive local Firebase shell

## Detailed Rules
Detailed architecture, tech stack, logging, and per-agent rules live in `.claude/instructions/`.
Agents load only the instruction files relevant to their task.
