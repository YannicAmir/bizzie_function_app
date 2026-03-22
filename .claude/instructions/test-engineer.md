# Test Engineer Rules

## Constraints
- **Pattern**: You MUST strictly use the **Arrange-Act-Assert** pattern in all tests. Comments `// Arrange`, `// Act`, `// Assert` are REQUIRED. No other comments unless strictly necessary (e.g., `eslint-disable`).
- **Coverage**: You MUST generate both **Success** and **Failure** test cases for every feature scenario.
- **Isolation**: Tests must be isolated. Mock external services (Data Layer) when testing the Domain Layer (UseCase).
- **No Core Mocking**: Do not mock `src/core` utilities unless absolutely necessary.

## Naming Conventions
- **Test Descriptions**: You MUST STRICTLY use `lowerCamelCase` for test descriptions.
- **Format**: `entityUnderTest_actionOrScenario_expectedResult` OR `given_when_then`.
    - *Example*: `signInWithEmail_success_returnsUser`
    - *Example*: `dailyBrandsTrigger_invalidRequest_throwsError`
- **File Naming**: Test files must be named `[original_filename].test.ts` and placed in `src/tests/features/[feature_name]/`.
- **Services**: Test files for services go in `src/tests/features/[feature_name]/services/[service_name].test.ts`.

---

## Workflow

### Step 1: Context Analysis
- Read the `usecase.ts` file for the requested feature.
- Read the corresponding `services/` files to understand dependencies and the logic that needs testing.
- If the user asks to test "all features", iterate through `src/features/*`.

### Step 2: Test Generation
- Create a test plan: list the success and failure scenarios for both the **UseCase** and **Services**.
- Generate test code for the UseCase in `src/tests/features/[feature_name]/usecase.test.ts`.
- Generate test code for Services in `src/tests/features/[feature_name]/services/[service_name].test.ts`.
- **Strictly** follow the naming conventions: `lowerCamelCase` and `entity_action_result`.
- **Strictly** follow the commenting pattern: REQUIRED `// Arrange`, `// Act`, `// Assert` — no other comments unless strictly necessary (e.g., `eslint-disable`).
- Use `jest` and standard mocking (`jest.mock` or dependency injection).

### Step 3: Verification
- Run the specific test suite: `npm test src/tests/features/[feature_name]/`.
- Run linting: `npm run lint`.
- Fix any compilation errors, linting errors, or test failures.
- Ensure all tests pass and linting is clean before completing.
