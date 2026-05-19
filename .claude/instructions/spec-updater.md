# Spec Updater Rules

## Purpose

Apply user-requested changes to existing spec markdown docs. Update only what was asked — no silent cleanup, no reformatting, no expansion of unrelated sections.

---

## Phase 1: Understand the change request

Before touching any file:

1. Confirm the feature name and which sub-feature(s) are affected.
2. Read the user's change request carefully and restate it back in one sentence to confirm you understood it correctly. Wait for the user to confirm before proceeding.
3. Identify the exact doc files that need to change. Common mappings:
   - Data model change → `data-models.md`, and possibly `usecase.md` if field names appear there
   - New service function → `{service-name}.md`, `usecase.md`, `tech-stack.md`
   - Retry config change → `{service-name}.md`, `tech-stack.md`
   - New sub-feature → create a new folder following the same structure as existing sub-features
   - Schedule or trigger change → `trigger.md`, `overview.md` trigger table
   - Firestore path change → `firestore-service.md`, `data-models.md`

4. List the files you plan to edit before making any changes. If the user says the scope is wrong, adjust.

---

## Phase 2: Read before writing

Read every file you plan to edit in full. Also read any file that links to or is linked from those files — a change to one doc often requires updating cross-links in another.

Check for cascading impacts:
- If `data-models.md` changes a field name, check `usecase.md` and `firestore-service.md` for mentions of that field.
- If a function is renamed in `usecase.md`, check that `trigger.md` and the relevant `{service}.md` are consistent.
- If a new file is added, the sub-feature's `overview.md` docs index table must be updated.
- If content would push a file past 100 lines, split it. Follow the same file-splitting rules as spec-writer.

---

## Phase 3: Apply the changes

Edit only the sections that need to change. Do not:
- Reformat unchanged sections
- Add comments or annotations about the change
- Change prose wording that is not part of the requested change
- Remove open questions from `tech-stack.md` unless the user explicitly resolved them

If the change requires adding a new file (e.g., a new service doc), write it following the same format rules as `spec-writer.md` Phase 4.

Maintain these invariants after every edit:
- Every file stays under 100 lines (split if necessary)
- Cross-links between docs still work (`.md` hrefs point to real files)
- The `overview.md` docs index table lists every doc in the sub-feature folder
- No fabricated details — only write what the user confirmed

---

## Phase 4: Verify

After all edits:

1. Re-read every file you modified.
2. Confirm the change is exactly what the user requested — no more, no less.
3. Check that no cross-links are broken.
4. Report a summary: which files were changed and what was changed in each (one line per file).

---

## Phase 5: Trigger HTML update

After verification, report the list of changed `.md` file paths, then invoke:

```
@.claude/agents/spec-html-updater.md
```

Pass the list of changed files in the conversation so the HTML updater renders only those files.

---

## Rules

- Never change a file that was not in your edit plan from Phase 1.
- Never modify implementation files (`src/**/*.ts`) — spec docs only.
- Never remove content the user did not ask to remove.
- If a requested change would contradict the existing codebase (e.g., a collection that already exists with a different name), flag it to the user before editing.
- File:line references are not required in spec docs — these are design docs, not validation reports.
