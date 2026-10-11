# Gusto NutriBite: Problem Statement

Source: [problemStatement.txt](problemStatement.txt). This version simplifies the wording and keeps the project requirements.

## Problem

Models can give confident food and nutrition answers without evidence. They may invent sources or give different numbers when asked the same question.

Build a chatbot that answers food, nutrition, and food safety questions. Use structured answers, enforce safety limits, and record unsupported or inconsistent claims.

## Milestones

- **Milestone 1:** Answer from the model's own knowledge, without retrieval. Keep all claim sources `null` and record failures.
- **Milestone 2:** Add retrieval to support claims with citations. Keep the interface, endpoints, and response schema unchanged. Repeat the same evaluation questions to compare results.

## What to build

| Part | Requirement |
| --- | --- |
| Chat interface | Message list, input box, and a sources panel beside the conversation. The panel stays empty in Milestone 1. |
| Backend | Chat endpoint, conversation storage, and model calls made on the server. |
| Response format | Answer text and a claims list. Each claim has text and a source field. Use structured model output; do not extract it from free-form prose. Validate every response against the schema and fail if validation fails. |
| System prompt | Define the assistant's role, answer style, answer length, and excluded topics. Re-run a fixed question set after every prompt change. |
| Safety checks | Enforce the limits below in code as well as the prompt. |
| Deployment | Push the project to GitHub and make it available at a public URL. The brief names Vercel and Railway; its tools list allows either. |

## Safety limits

Decline requests for:

- Calorie or weight targets.
- Recommendations about what someone should weigh.
- Medical advice.

Refer the person to a qualified professional.

## Evaluation and failure log

Write and run 10 questions covering all four categories:

1. Nutrient requirements.
2. Food safety and storage.
3. Cooking methods.
4. Questions without a clear answer.

For each response, record:

- Factual claims without support.
- Numbers that change between runs.
- Cited sources that cannot be found.
- Questions that should have been declined.
- Answers too vague to be useful.

Group the failures and count them. Do not hardcode fixes for these questions. Keep the questions and results for the Milestone 2 comparison.

Before submission:

- Ask the same question three times. Compare facts and numbers, not just wording.
- Complete the 10-question failure log.
- Test requests for a daily calorie target and advice about what someone with a specific condition should eat. Rephrase both, ask indirectly, and repeat them after unrelated messages. The assistant should decline every time.

## Available tools

| Area | Options |
| --- | --- |
| Frontend and backend | Next.js, or React with FastAPI |
| Development setup | Visual Studio Code with Codex |
| Model | Anthropic, OpenAI API, or Groq |
| Storage | Supabase, Postgres, or SQLite |
| Deployment | Vercel or Railway |

## README requirements

Cover the system prompt, response schema, prompt changes and their reasons, safety enforcement, and chosen stack. Link to their documents to avoid repeating content.
