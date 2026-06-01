# BRAT EAT AI Agent Rules

Version: V1 source of truth

## Global Rule

All AI tools must read `/brain` before coding.

No AI tool is allowed to invent product logic that conflicts with `/brain`.

## Claude Code Role

Claude Code is the main software architect and backend generation tool.

Claude Code can:

- design architecture;
- generate backend modules;
- generate technical documentation;
- explain decisions;
- implement module-by-module;
- create tests for critical backend flows.

Claude Code must not:

- generate the entire app in one request;
- bypass the order state machine;
- duplicate business logic across modules;
- emit realtime events before persistence;
- override Flaix decisions;
- introduce microservices in V1;
- add major dependencies without explanation.

## Cursor Role

Cursor is the daily implementation and UI iteration tool.

Cursor can:

- polish frontend UI;
- implement reusable components;
- fix small bugs;
- improve UX flows;
- integrate existing APIs;
- refactor local UI code.

Cursor must not:

- redesign backend architecture;
- change order lifecycle rules;
- duplicate business logic in UI;
- bypass permissions;
- invent new product scope.

## Codex Role

Codex is the audit, review, test and support generation tool.

Codex can:

- audit architecture and code;
- generate tests;
- generate repetitive utilities;
- generate CRUD support code;
- inspect consistency across files;
- review Claude Code output.

Codex must not:

- redesign product logic without explicit instruction;
- modify critical realtime flows casually;
- accept generated code without testing or review.

## Mandatory Task Prompt for Claude Code

```text
You are the lead software architect for BRAT EAT.

Before coding, read every file in /brain.

Respect:
- PRODUCT_VISION.md
- ARCHITECTURE.md
- DOMAIN_MODEL.md
- ORDER_STATE_MACHINE.md
- REALTIME_CONTRACTS.md
- FLAIX_CONTRACT.md
- ROADMAP.md
- AGENTS.md
- DESIGN_SYSTEM.md
- TESTING_STRATEGY.md
- ENGINEERING_MANUAL.md

Task:
[INSERT ONE SMALL TASK]

Constraints:
- Production-ready TypeScript.
- Strict module boundaries.
- No duplicated business logic.
- No microservices in V1.
- Realtime-safe implementation.
- Persist critical state before emitting realtime events.
- Use the order state machine exactly as defined.
- Do not override Flaix decisions.
- Add tests for critical logic.

Before implementation:
- summarize the relevant /brain rules;
- explain the intended approach;
- list files that will be created or modified.

After implementation:
- generate or update TASK_SUMMARY.md.
- update ENGINEERING_MANUAL.md with exact code references and line numbers.
```

## Mandatory Task Summary Format

Every implementation task must update `TASK_SUMMARY.md` with:

- task name;
- date;
- what was created;
- what was modified;
- why it was done;
- architecture decisions;
- dependencies added;
- tests added or skipped;
- risks;
- next steps.

Every implementation task must also update `ENGINEERING_MANUAL.md` with:

- what block was built;
- why it exists;
- how it works step by step;
- exact file and line references;
- data flow;
- dependencies;
- tests and verification;
- risks and safe change rules;
- debugging notes.

If code was created or modified but `ENGINEERING_MANUAL.md` was not updated, the task is incomplete.

## Review Rule

After Claude Code generates code, Codex should audit:

- architecture compliance;
- order lifecycle compliance;
- realtime safety;
- TypeScript strictness;
- duplicated business logic;
- missing tests;
- unnecessary complexity.
- missing or vague engineering manual references.
