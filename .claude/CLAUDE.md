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

## Manual scripts
One-off/manual scripts live in `src/scripts/`. Every new manual script must get an npm script entry in `package.json` (using `ts-node --transpile-only`) so it is run as `npm run <name> -- <args>`. When giving the user run instructions, always use the `npm run` form — never `npx ts-node ...` and never a `PATH="..."` prefix.
- `npm run backfill:watchlist-logos -- --project <dev|qa|prod> [--dry-run] [--force]` — backfill `logoUrl` on user watchlist docs from FMP profiles
- `npm run harness:ytd-sync -- --project <dev|qa|prod>` — run `ytd_price_sync` end-to-end against a fixed ticker set (live FMP + Firestore), then read the `ytd_price_change` docs back

