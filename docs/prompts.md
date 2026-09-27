# Prompts used with coding agents

Kept as evidence of how AI was used. Add every significant prompt you run.

## 1. First prompt — Milestone 1

```
You are a senior Node.js backend engineer building the AI Gateway in this repository,
a 7-day challenge project graded on architecture, security basics, API design, data
model, reliability, error handling and AI integration.

CONTEXT
Read AGENTS.md, then docs/PLAN.md, docs/architecture.md, docs/database.md,
docs/api-design.md and docs/error-codes.md. They are the approved design; follow them.

TASK
Implement Milestone 1 (Scaffold) from docs/PLAN.md, and nothing from later milestones.

BEFORE WRITING CODE
1. Summarize M1 in at most 8 bullets in your own words.
2. List every file you will create, with exact dependency versions you plan to install
   and why each Zod / zod-to-openapi version pair is compatible.
3. List any ambiguity or conflict between the docs, with a proposed resolution.
Then stop and wait for my approval.

CONSTRAINTS
- JavaScript ES modules, Node.js 22, only the dependencies in AGENTS.md §3.
- Write the first migration by hand in SQL and implement every item of
  docs/database.md "Migration requirements".
- Configuration only from environment variables validated with Zod; never hard-code secrets.
- Must work on Windows with Docker Desktop.

VERIFICATION (show real command output; never claim success without it)
- npm run lint, npm run format:check, npm test
- docker compose up --build, then GET /health and GET /docs
- On the test database prove that: status = 'abc' is rejected, a message with an
  unknown conversation_id is rejected, total_tokens equals input + output.

OUTPUT WHEN DONE
- Tick M1 criteria and append a Progress log entry in docs/PLAN.md.
- Reply with: files changed · commands run and results · deviations from the docs and
  why · 2–4 suggested notes for AI_WORKLOG.md.
```

## 2. Next milestone (change N)

```
Continue the AI Gateway project. Read AGENTS.md and the Progress log in docs/PLAN.md.
Implement Milestone <N> only, with the same process: summary + file list + ambiguities
first and wait for approval; then implement; verify with real command output; update
docs/PLAN.md; report as in AGENTS.md §11.
```

## 3. Cross-review (run with the other agent after each milestone)

```
Act as a strict reviewer for this AI Gateway repository. Read AGENTS.md and docs/*.md.
Review only the Milestone <N> changes (git diff <base>..HEAD). Do not modify files.
Report, ordered by severity: violations of the docs or AGENTS.md, bugs, security issues,
missing tests, anything that would fail in production. For each: file:line, problem,
why it matters, suggested fix.
```

## 4. When the agent is wrong

```
Stop. <what is wrong, with evidence: error output or doc section>.
Explain the root cause first, then propose a fix. Do not change unrelated files.
```

## Log of prompts actually run

| Date | Agent | Milestone | Prompt | Notes |
| ---- | ----- | --------- | ------ | ----- |
