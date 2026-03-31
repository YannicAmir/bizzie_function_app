---
name: Testing Steps
description: Step-by-step process for generating and verifying success/failure test cases for backend features.
---

# Testing Steps

Follow these phases to ensure high test coverage and reliability for backend features.

---

## Phase 1: Context Analysis

1.  **Analyze Feature**: Read the `usecase.ts` and its dependent `services/` to define the logic boundaries.
2.  **Define Plan**: List success and failure scenarios for both the Domain Layer (UseCase) and Data Layer (Services).

---

## Phase 2: Test Generation

1.  **Scaffold Test Files**:
    -   UseCase: `src/tests/features/[feature_name]/usecase.test.ts`.
    -   Services: `src/tests/features/[feature_name]/services/[service_name].test.ts`.
2.  **Implement Arrange-Act-Assert**:
    -   **Arrange**: Setup mocks, dependencies, and input data.
    -   **Act**: Execute the function or method under test.
    -   **Assert**: Verify results, status codes, and mock calls.
3.  **Enforce Naming**: Use `lowerCamelCase` with the format `entity_action_result`.

---

## Phase 3: Verification

1.  **Run Tests**: Execute `npm test src/tests/features/[feature_name]/`.
2.  **Audit Linting**: Ensure `npm run lint` passes with no violations.
3.  **Refactor**: Fix any failures until all test cases pass and coverage is met.

---

## Verification Checklist

- [ ] Test files follow the directory placement standard.
- [ ] Every test case uses the **Arrange-Act-Assert** pattern with required comments.
- [ ] Both success and failure scenarios are covered.
- [ ] Naming follows `lowerCamelCase` and `entity_action_result`.
- [ ] External services are mocked when testing the UseCase.
- [ ] `npm test` and `npm run lint` pass cleanly.
- [ ] All paths are project-root-relative.
