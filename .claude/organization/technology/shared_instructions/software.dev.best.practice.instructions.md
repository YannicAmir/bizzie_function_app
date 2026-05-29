---
name: software dev best practice
description: General software development best practices for quality, maintainability, and correctness. Language-agnostic principles applied by all technology agents.
---

# Software Development Best Practice

> Scope: language-agnostic principles.

---

## 1. DRY — Don't Repeat Yourself

- Every piece of knowledge must have a single, authoritative representation in the codebase.
- If the same logic appears in two places, extract it. If it appears in three, it is mandatory to extract it.
- Duplication applies to logic, not just copy-pasted code — two functions that compute the same thing differently are still a DRY violation.
- Exception: slight duplication is acceptable when two components are coincidentally similar but have genuinely different reasons to change.

---

## 2. Single Responsibility

- Every function, class, and module must have exactly one reason to change.
- If describing what a function does requires the word "and", it likely has more than one responsibility — split it.
- Classes that grow beyond ~200 lines are a signal of multiple responsibilities; review and refactor.
- Keep side effects isolated: a function that computes a value should not also write to a database or mutate external state.

---

## 3. Open / Closed

- Code should be open for extension but closed for modification.
- Add new behavior by adding new code (subclasses, strategy implementations, new modules) rather than editing existing, tested code.
- Avoid `if/else` or `switch` chains that must be extended every time a new variant is added — prefer polymorphism or a registry pattern.

---

## 4. Naming

- Names must communicate intent — a reader should understand what a thing does without reading its implementation.
- Avoid abbreviations, acronyms, and single-letter names (outside loop indices).

---

## 5. Functions

- A function must do one thing, do it well, and do it only.
- Limit to ~20–30 lines. If longer, extract sub-functions.
- Minimize the number of parameters — more than three is a sign the function has too many responsibilities or needs a parameter object.
- Avoid flag (boolean) parameters that alter control flow — split into two named functions instead.
- Functions must have no hidden side effects beyond what their name implies.

---

## 6. Comments

- Code should be self-documenting; comments explain **why**, not **what**.
- Never leave commented-out code in the codebase — version control preserves history.
- Do not restate what the code already says (`// increment i` above `i++`).
- Use comments to document non-obvious decisions, constraints, or gotchas that cannot be expressed in code.
- Use comments sparingly — if you find yourself needing to write a long comment to explain code, consider refactoring the code to be clearer instead.

---

## 7. Error Handling

- Handle errors at the level where meaningful recovery or context is available.
- Never silently swallow exceptions — at minimum, log the error before discarding it.
- Fail fast: validate inputs at the entry point of a function and throw/return early rather than propagating invalid state deep into the call stack.
- Prefer explicit error types over generic exceptions where callers need to distinguish failure modes.

---

## 8. YAGNI — You Aren't Gonna Need It

- Do not implement functionality until it is actually required.
- Avoid speculative generality: no abstract base classes, plugin systems, or configuration hooks for requirements that do not yet exist.
- Every abstraction must earn its place by solving a present problem, not a hypothetical future one.

---

## 9. Code Review Standards

- Every change must be reviewable — keep commits and PRs focused on a single concern.
- No magic numbers or magic strings — assign them to named constants.
- No dead code — remove unused functions, variables, imports, and parameters before submitting.
- All public APIs must have clear, accurate documentation.
- Tests must accompany any non-trivial logic change.

---

## 10. Quality Checklist

- [ ] No duplicated logic — DRY applied.
- [ ] Every function/class has a single, clear responsibility.
- [ ] No boolean flag parameters that alter control flow.
- [ ] No magic numbers or strings — named constants used.
- [ ] No commented-out code or dead code.
- [ ] No silent exception swallowing.
- [ ] Names communicate intent without requiring implementation knowledge.
- [ ] No speculative abstractions (YAGNI).
