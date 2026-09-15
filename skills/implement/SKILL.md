---
name: implement
version: 1.0.0
description: |
  Orchestrate fetch → review-ticket → refine-ticket → create-implementation-plan
  as isolated subagents (fresh context each hop), then pause for plan approval
  before a new execute-plan subagent. Use when asked to "implement this ticket",
  "run the ticket pipeline", "pick up this ticket", or "/implement".
allowed-tools:
  - Glob
  - Bash
  - AskUserQuestion
---

# Implement — isolated ticket pipeline

You are a **thin parent**. You do not fetch, review, refine, plan, or write product code. You
launch one isolated worker per hop, pass it a path or id, and keep only **paths + one-line
status**. The on-disk artifacts are the handoff — not this conversation.

Hops: **fetch → review-ticket → refine-ticket → create-implementation-plan → (you approve) →
execute-plan**.

## Input

`/implement <ticket URL | tracker id | path to an existing .TICKET.md>`. If the input is
ambiguous or missing, ask — don't guess.

## Parent rules (strict)

- Do **not** Read any phase SKILL.md. Do **not** Read ticket, review, requirements, or plan
  bodies. Existence checks only: Glob or `test -f` on the path the worker returned.
- Do **not** analyze, plan, or edit product code.
- **Fresh context between phases** = a **new** isolated subagent every hop. Never resume a
  worker across phases.
- **Same** worker may be resumed **inside** refine or plan only to continue grilling (that
  conversation belongs in that phase).
- If a worker fails, **stop**. Do not skip ahead.

## Isolation

Each hop is one isolated worker (`Task` / Claude Code `Agent` — vendor-agnostic). Wait for it
to finish before the next hop.

When the harness **cannot** isolate a context, **do not** run the phase inline. Fall back to
the copy-pasteable launch command that phase skill already prints, give it to the user, and
**stop**.

## Worker prompt

Fill every `<placeholder>`. The worker locates and follows the named skill's SKILL.md itself.

```
Read and follow the SKILL.md for `/<skill-name>` (same skill collection as `/implement`).
Do not wait to be handed the skill body.

Input: <url, id, or project-relative path>

When finished, return ONLY:
- status: ok | failed | blocked-questions
- artifact: project-relative path of the file this phase writes (or the ticket file, for fetch)
- extra-artifacts: any other project-relative paths this phase wrote (attachments, review file, …)
- warnings: short; omit if none
- questions: only when status is blocked-questions — the exact questions for the user

Do not echo the ticket, review, requirements, or plan body.
```

| Hop | `<skill-name>` | Input | Expected artifact |
| --- | --- | --- | --- |
| Fetch | `fetch-ticket` | URL or id | `*.TICKET.md` |
| Review | `review-ticket` | that `.TICKET.md` | `*.TICKET-REVIEW.md` |
| Refine | `refine-ticket` | that `.TICKET.md` | `*.REQUIREMENTS.md` |
| Plan | `create-implementation-plan` | that `.REQUIREMENTS.md` | `*.PLAN.md` |
| Execute | `execute-plan` | that `.PLAN.md` | (code; no new planning file required) |

After each hop, tell the user the artifact path in one short line (and any warnings). Then
continue — except at the plan gate.

## Grilling (refine and plan)

Those skills interview the user. Prefer that the worker's AskUserQuestion / AskQuestion
surfaces to you directly while it runs.

If questions **cannot** bubble from the child, the worker stops with `status: blocked-questions`.
Ask the user those questions (one at a time if the phase skill would), then **resume that same
worker** with the answers. Do **not** spawn a new worker mid-grill.

## Hops

1. **Fetch** — skip if the input is already a local `.TICKET.md` that exists. Otherwise launch
   fetch. The ticket path it returns is the input to every later ticket-file hop.
2. **Review** — launch review on that ticket file. Review-ticket is non-interactive on
   requirements and already handles set-mode from `## Ticket set`. No approval gate here:
   refine will grill any shipped questions. Report the review path and continue.
3. **Refine** — launch refine on the **ticket** file (not the review). Refine picks up a
   sibling `.TICKET-REVIEW.md` itself.
4. **Plan** — launch create-implementation-plan on the `.REQUIREMENTS.md` refine returned.
5. **Gate** — print the `.PLAN.md` path and **ask whether to execute**. Do not launch execute
   until the user says yes. If they decline, stop and leave the plan on disk.
6. **Execute** — **new** worker: execute-plan on that plan file only.

## Done

When execute finishes, report its status and whatever validation it ran. Still no commit, branch,
or PR unless the user asks.
