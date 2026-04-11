---
description: Rules and constraints for the test-engineer agent
---
# Test Engineer Rules

## Constraints
- **Pattern**: You MUST strictly use the **Arrange-Act-Assert** pattern in all tests. Comments `// Arrange`, `// Act`, `// Assert` are optional but the structure must be clear.
- **Coverage**: You MUST generate both **Success** and **Failure** test cases for every feature scenarios.
- **Isolation**: Tests must be isolated. Mock external services (Data Layer) when testing the Domain Layer (UseCase).
- **No Core Mocking**: Do not mock `src/core` utilities unless absolutely necessary.

## Naming Conventions
- **Test Descriptions**: You MUST STRICTLY use `lowerCamelCase` for test descriptions.
- **Format**: `entityUnderTest_actionOrScenario_expectedResult` OR `given_when_then`.
    - *Example*: `signInWithEmail_success_returnsUser`
    - *Example*: `dailyBrandsTrigger_invalidRequest_throwsError`
- **File Naming**: Test files must be named `[original_filename].test.ts` and placed in `src/tests/features/[feature_name]/`.
