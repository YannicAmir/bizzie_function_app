---
name: Spec Validator Instructions
description: Four-phase workflow for exhaustively comparing a TypeScript service implementation against its spec docs and producing a structured divergence report.
---

# Instructions for SpecValidator

## Inputs (Required from User)

1. Implementation path(s) — one or more `.ts` source files to audit (e.g. `src/features/weekly_recap/services/ai_service.ts`)
2. Spec doc path(s) — one or more `.md` spec files that govern those files (e.g. `src/features/weekly_recap/docs/storage/ai-service.md`)

If the user provides a feature name without explicit paths, glob for `src/features/{feature}/docs/**/*.md` and the corresponding `src/features/{feature}/**/*.ts` files.

## Phase 1: Read Everything

- Read every provided spec doc in full.
- Read every provided implementation file in full.
- Do not skip sections or truncate — the comparison must be exhaustive.

## Phase 2: Build the Spec Contract

Extract every verifiable claim from the spec docs. A claim is anything that the implementation can confirm or contradict:
- Function signatures (name, parameters, return type)
- Firestore paths and collection names
- Pub/Sub topic names and message payload shapes
- HTTP endpoints, query parameters, and response field mappings
- Retry config values (`maxAttempts`, `initialDelayMs`, `backoffFactor`)
- Field names, types, and constraints (e.g. `messageTitle ≤ 50 chars`)
- Logging events (level, message format)
- Control flow (e.g. fire-and-forget, no `await`, throws on error)
- External SDK usage (e.g. Secret Manager pattern)
- Ordering of steps within a function

## Phase 3: Compare Implementation to Contract

For each spec claim, check the implementation. Classify each finding as:

| Status | Meaning |
|---|---|
| Conforms | Implementation matches the spec |
| Partial | Implementation roughly matches but deviates in a minor detail |
| Diverges | Implementation contradicts or omits a spec requirement |
| Undocumented | Implementation does something the spec does not mention |

Only include Conforms items in a brief summary count — do not list every passing item individually.

## Phase 4: Write the Report

Write the report to:
```
src/features/{feature}/docs/{sub_feature}/spec-validation-{service-name}.md
```

### Report Format

```markdown
# Spec Validation — {ServiceName}

**Spec docs reviewed:** {list of spec files}
**Implementation reviewed:** {list of source files}
**Date:** {today}

---

## Summary

{N} claims checked — {n} conform, {n} partial, {n} diverge, {n} undocumented.

---

## Divergences

### {Short title of divergence}

**Spec says:** {exact quote or paraphrase from spec}
**Code does:** {what the implementation actually does, with file:line reference}
**Impact:** {why this matters — data loss, wrong behaviour, silent failure, etc.}

---

## Partial Matches

### {Short title}

**Spec says:** ...
**Code does:** ...
**Difference:** {what specifically is off}

---

## Undocumented Behaviour

### {Short title}

**Code does:** ...
**Not in spec:** {confirm this is absent from the spec}
**Recommendation:** {add to spec / remove from code / intentional — explain}

---

## Conforming Claims

{N} claims verified as conforming — no issues.
```

## Rules

- Never modify implementation files or spec docs — output only.
- Do not invent divergences. Every finding must be grounded in a direct contradiction between the spec text and the code.
- File:line references are required for every Diverges and Partial finding.
- If the spec is ambiguous on a point, note it under Undocumented Behaviour rather than calling it a divergence.
- Keep each finding concise — one paragraph max per item.
- If there are zero divergences, say so explicitly and skip those sections.

---

## Checklist
- [ ] Implementation path(s) and spec doc path(s) obtained from user
- [ ] All spec docs read in full
- [ ] All implementation files read in full
- [ ] Complete spec contract extracted (all verifiable claims listed)
- [ ] Every claim checked against the implementation
- [ ] Findings classified (Conforms / Partial / Diverges / Undocumented)
- [ ] File:line references provided for all Diverges and Partial findings
- [ ] No invented divergences — all grounded in direct contradiction
- [ ] Report written to `spec-validation-{service-name}.md` in correct location
