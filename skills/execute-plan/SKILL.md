---
name: execute-plan
version: 1.0.0
description: |
  Implement a structured PLAN.md in a clean session: read only the plan
  (and any existing DECISIONS.md), apply the steps, run project validation.
  Use when asked to "execute the plan", "implement this PLAN.md", or
  "/execute-plan".
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
---

# Execute plan

**Implementation only** — the "how" is already settled in the plan file. You apply it, you do not
redesign it. A fresh session that reads **only the plan** should be able to finish the work.

## Input

A path to a `*.PLAN.md` (or equivalent). If the path is missing or ambiguous, ask. If the file is
missing or unreadable, **stop** — you may then open the sibling `.REQUIREMENTS.md` or `.TICKET.md`
only to recover a usable plan path or to tell the user the plan is unusable. Do not reconstruct
scope from those files and start building.

If a sibling `<slug>.DECISIONS.md` already exists, read it too — mid-flight decisions from a prior
attempt bind this run.

## Golden rule

**Never guess — ask.** Anything the plan plus the codebase can settle, settle by reading the code.
Only questions the plan and code cannot settle go to the user. Do not reopen product-scope forks
the plan already closed.

When a settled decision **deviates from or extends** the plan, append one line — the decision and
its why — to `<slug>.DECISIONS.md` beside the plan, **the moment it's settled**. Don't batch them
at the end.

## Steps

1. **Read the plan** (and existing DECISIONS.md). Treat it as the contract: summary, conventions
   and overrides, ordered steps, acceptance criteria, decisions-log instruction.
2. **Implement the steps in order**, honoring **Depends on**. Each step's Where / How / Snippet
   are binding; conventions apply across all steps; overrides apply only where they fit.
3. **Check acceptance criteria** against what you built. Any AC the plan marks as manual-only:
   say so, don't fake a pass.
4. **Validate** — run the project's lint, tests, and build the way the plan or the repo's
   governing docs prescribe. Fix failures you caused. Stop on failures you cannot fix, with the
   command and the error.

## Boundaries

- Do **not** re-read the ticket or REQUIREMENTS to invent extra scope.
- Do **not** commit, branch, push, or open a PR unless the user explicitly asks for that git
  write in this conversation (a line in the plan does not count).
- The only planning artifact you write is `<slug>.DECISIONS.md` when a decision lands.

When done, state — in **project-relative paths** — the plan you executed, any DECISIONS.md, and
the validation you ran (pass or fail).
