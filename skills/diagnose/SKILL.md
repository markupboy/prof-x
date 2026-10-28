---
name: diagnose
version: 1.0.0
description: |
  Diagnose a customer support ticket from Linear: fetch it, validate the
  reported issue against the code, work with the user to replicate it when the
  code alone can't settle it, and — if it's a real defect — plan the fix for
  approval and execute it like any implementation work. Use when asked to
  "diagnose this ticket", "is this support issue real", "investigate this
  customer report", or "/diagnose".
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash
  - Agent
  - AskUserQuestion
---

# Diagnose

Take a customer-reported issue from Linear to a verdict — **confirmed defect**, **not a defect**,
or **can't tell** — with evidence. A confirmed defect continues into the normal pipeline:
requirements → plan → your approval → execute.

Diagnosis is read-only on the code. Nothing is edited until the user has approved a plan.

## Input

`/diagnose <Linear ticket URL | key>`, or a local `.TICKET.md`. If missing or ambiguous, ask.

## Golden rule: confirmed, claimed, assumed

Keep three things apart in every note and in the final file: what you **confirmed** (code you read,
output you saw, something the user observed), what the customer **claims**, and what you
**assume**. Claims and assumptions never turn into confirmations without evidence. Local environment
state describes only this machine — never treat it as the customer's.

## Steps

1. **Fetch.** Skip if the input is already a local `.TICKET.md`. Otherwise delegate to an isolated
   subagent that follows [fetch-ticket](../fetch-ticket/SKILL.md), so the fetch doesn't bloat this
   session, then read the file it returns. Follow linked tickets, attachments, and screenshots that
   bear on the report.
2. **Pin down the report.** Extract: what the customer did, what they saw, what they expected,
   which account / site / role / plan / browser / data is involved, when it started, and how often.
   Note what's missing. Ask the user only for what neither the ticket nor the code can supply.
3. **Gather evidence beyond the ticket.** If the ticket references an error-tracker fault, log
   entry, or conversation and a matching tool is connected (Honeybadger, Datadog, Intercom), read
   it for the stack trace, timing, and affected accounts. Read-only. If it isn't reachable, say so
   and move on.
4. **Validate from the code.** Trace the reported path end to end: entry point → logic → data →
   output. Look for the code that would produce the symptom, and check the conditions the customer's
   setup implies (permissions, feature flags, settings, data shape, edge cases). Check recent
   history (`git log` / `git blame` on the suspect paths) for a change that lines up with the
   reported start date. Before calling something absent, widen the search — "not found under the
   name the ticket used" isn't "not present".
5. **Verdict or replicate.**
   - The code explains the symptom → **confirmed**; go to step 7.
   - The code shows the behavior is intended, or the report rests on a misunderstanding or config
     → **not a defect**; go to step 7.
   - The code can't settle it → **replicate with the user** (step 6). Never settle this with a
     plausible guess.
6. **Replicate with the user.** Work out a concrete hypothesis first, then make it cheap to test:
   - Give numbered repro steps with the exact data, setting, or role that matters, and say what
     you expect to see if the hypothesis is right *and* if it's wrong.
   - Ask the user to run them (or to read a value, check a setting, query a record) and report back.
     One experiment at a time; each result narrows or replaces the hypothesis.
   - Offer to drive a browser with [/browse](../browse/SKILL.md) if the local app can reproduce it.
     Use only the local or staging environment, never production, and don't write to customer data.
   - Stop when it reproduces (**confirmed**), when it demonstrably doesn't (**not reproducible** —
     list what was tried and what the customer would need to provide), or when the user calls it.
7. **Write the diagnosis** and show the user the verdict and the reasoning behind it, ahead of any
   fix. Then:
   - **Confirmed defect** → continue to *Fix*.
   - **Not a defect / not reproducible** → stop. Offer to draft a reply for support; don't post
     anything to Linear. If drafting, invoke `use-conversational-language` first.

## Output: the DIAGNOSIS file

Follow the project's planning-directory convention (default `.agents/plans/`). Write
`<dir>/<id>-<slug>.DIAGNOSIS.md` beside the `.TICKET.md` (same directory, same base name with
`.DIAGNOSIS`). It must stand alone for a fresh session with no memory of this one.

Sections (omit any that are empty):

1. **Verdict** — one of confirmed defect / not a defect / not reproducible, plus a one-sentence
   summary.
2. **The report** — what the customer says happened and expected, in your words, with the ticket
   link.
3. **Evidence** — each finding labelled confirmed / claimed / assumed, anchored to paths and
   identifiers (line numbers are hints — they drift), tracker/log references, and anything the
   user observed during replication. Open with one line pinning the commit (short hash, noting
   uncommitted changes) and today's date.
4. **Root cause** — for a defect: where and why it breaks, and the conditions that trigger it.
5. **Blast radius** — who or what else is affected: other accounts, code paths sharing the cause,
   data already left in a bad state that a code fix won't repair.
6. **Replication log** — what was tried, in order, and what each showed.
7. **Open questions** — what is still unknown, with what would resolve it.

## Fix (confirmed defects only)

Same shape as `/implement`'s back half: isolated workers, artifacts on disk, user approval before
code changes.

1. **Requirements.** Write `<id>-<slug>.REQUIREMENTS.md` beside the diagnosis, in the format
   [refine-ticket](../refine-ticket/SKILL.md) defines: what must be true once fixed, anchored on the
   root cause, with verifiable acceptance criteria — a regression test that fails today belongs in
   them. Include the repair of already-corrupted data only if the blast radius shows some; if it's
   a separate effort, say so under Open questions. Show it to the user and get their OK on scope
   before planning.
2. **Plan.** Launch an isolated subagent that follows
   [create-implementation-plan](../create-implementation-plan/SKILL.md) on the requirements file.
   Questions it can't settle from the code come back to the user; resume the same worker with the
   answers.
3. **Approval gate.** Give the user the `.PLAN.md` path and a short summary of the approach and
   risk. Do not proceed without a yes. If they want changes, update the plan (resume the planning
   worker) and ask again.
4. **Execute.** Launch a **new** isolated subagent that follows
   [execute-plan](../execute-plan/SKILL.md) on the approved plan only. Report its status and the
   validation it ran.

If the harness can't isolate subagents, don't run those phases inline: print the launch command each
phase skill prints and stop.

## Boundaries

- Do **not** modify source files before plan approval; the only files written during diagnosis are
  the `.DIAGNOSIS.md` and the requirements.
- Do **not** modify the ticket in Linear or post anything to any tracker, chat, or customer
  channel.
- Do **not** touch production data or environments; keep any customer data from the ticket out of
  files beyond what the diagnosis needs.
- No commit, branch, or PR unless the user asks.

## Next step

State the verdict and the `.DIAGNOSIS.md` path (project-relative). After a fix, report the
execution result and suggest `/self-review` or `/handover` as the next step.
