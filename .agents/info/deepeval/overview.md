# DeepEval: The Industry Standard for LLM Evaluation

DeepEval is an open-source framework designed to bring the rigor of traditional unit testing to Large Language Model (LLM) applications. It allows you to quantify the performance of your AI using "unit tests" that measure quality, safety, and accuracy.

## Core Capabilities

### 1. LLM-Based Metrics
Unlike traditional code tests that check for exact string matches, DeepEval uses "LLM-as-a-Judge" (G-Eval) to evaluate semantic qualities.
- **Faithfulness**: Does the answer stay true to the retrieved context? (Prevents Hallucinations)
- **Answer Relevancy**: Does the answer actually address the user's prompt?
- **Hallucination Metric**: Specifically flags when a model makes up facts not present in its knowledge base.
- **Custom G-Eval**: You can define your own criteria (e.g., "Conciseness", "Tone", "Professionalism").

### 2. Gold Datasets & "Ground Truth"
Professionals don't test against random prompts. They use **Gold Datasets**—vetted collections of inputs and their ideal ("Ground Truth") outputs.
- Track regressions: Ensure that improving a prompt for "Question A" doesn't break "Question B".
- Versioning: Link your datasets to your code versions in the cloud.

### 3. Synthetic Data Generation
Don't have thousands of test cases? DeepEval can generate them from your existing documentation (PDFs, TXT, etc.) using its **Synthesizer**, creating complex "multi-hop" queries that mimic real user behavior.

### 4. Confident AI (Cloud Dashboard)
Every test you run locally or in CI/CD is pushed to **Confident AI**.
- **Centralized Logs**: See every test run across your entire team.
- **Regression Testing**: Compare current performance against a stable "baseline" version.
- **Human-in-the-Loop**: Allow non-technical experts to review and "thumb up/down" model responses, which can then be saved back into your Gold Dataset.

---

## The "Professional" Workflow (Industry Standard)

The most successful AI teams follow this three-stage pipeline:

### Phase 1: Local Development (Iterate Fast)
- Engineers use the `deepeval test run` command to verify localized changes (e.g., a new system prompt).
- **Goal**: Quick feedback loop.
```bash
APP_ENV=dev .venv/bin/deepeval test run src/features/bizzie_chat/agent/tests/test_smoke.py
```

### Phase 2: CI/CD Pipeline (The Gatekeeper)
- Tests run automatically on every Pull Request (PR).
- **Hard Fails**: If a PR drops the average "Faithfulness" score below 0.7, **the build fails**, and the code cannot be merged.
- **Goal**: prevent regressions from reaching users.

### Phase 3: Production Monitoring (Real-World Evals)
- Use DeepEval in your production environment to log real user interactions.
- **Triggers**: Periodically sample production logs and run them through your evaluation metrics to detect model "drift" over time.

---

## Analyzing Low Pass Rates

If your tests are showing low scores (e.g., 20% pass rate), don't panic! This is the most valuable part of the process.

### Common Reasons for Low Scores:
1. **Misaligned Expected Outputs**: If your "expected output" in the test case is too generic or outdated, the judge will penalize the actual model response.
2. **Retrieval Gaps**: If your RAG system fails to retrieve the correct context, the "Faithfulness" metric will correctly fail the response because it has no factual basis.
3. **Threshold Calibration**: A threshold of 0.7 is the standard, but for complex reasoning, you might start at 0.5 and tighten it as your prompts improve.
4. **Judge Model Quality**: Ensure your judge model (Gemini 3.1) is provided with enough context to understand the domain of your application.

> [!TIP]
> Use the **Confident AI Dashboard** to click into failed test cases. Look at the "Reasoning" provided by the judge—it will tell you exactly *why* it deducted points, which is your roadmap for prompt engineering.
