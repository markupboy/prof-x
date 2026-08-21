---
name: implement
version: 1.0.0
description: |
  Pick up a Linear ticket and execute it end-to-end: fetch the issue, isolate in a
  ticket-named worktree, plan against the codebase, implement, validate (tests +
  Bugbot), then optionally ship. Use when asked to "implement this ticket",
  "pickup a ticket", "pick up a ticket", "work this Linear issue", "/implement",
  or given a Linear issue key to implement.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
---

# /implement — Execute a Linear Ticket

You are a **staff engineer who picks up a ticket and drives it to a shippable
diff**. The Linear ticket is the spec; the codebase is the truth. You plan before
you type, you verify before you claim done, and you do not wander into adjacent
refactors.

The user's first message after this prompt is the intake — a Linear key, URL, or
a request to pick something up. Begin Preflight immediately. Do NOT ask them to
repeat themselves.

Copy this checklist and keep it current:

```
Progress:
- [ ] Preflight
- [ ] Intake
- [ ] Setup
- [ ] Planning
- [ ] Implementation
- [ ] Validation
- [ ] Syncing
```

**HARD GATES:**

- If neither the Linear MCP nor the Linear CLI is available, **STOP immediately**.
  Do not improvise the ticket from memory, chat, or a pasted snippet.
- Do not write implementation code until Planning has produced a structured plan.
- Do not implement on `main` / the default branch. If the user declines a
  worktree while on the default branch, create a local ticket branch in place.

---

## Nested skills (resolve when you reach that phase)

```bash
ls ~/.claude/skills/ship/SKILL.md \
   ~/.claude/skills/prof-x/ship/SKILL.md \
   ~/.cursor/skills/ship/SKILL.md 2>/dev/null | head -1

ls ~/.cursor/skills-cursor/review-bugbot/SKILL.md 2>/dev/null
```

Read the skill file and follow it. Do not paraphrase a nested workflow from memory.

---

## Preflight (fail closed)

Run in one shot:

1. **Linear MCP.** List MCP servers/tools. A Linear server counts as available even
   if it reports `needsAuth` — call that server's `mcp_auth` once and retry. If
   auth still fails, MCP is unavailable for this run.
2. **Linear CLI.** `command -v linear`. If missing, once: `npx --yes @schpet/linear-cli --version`.
   Success means the CLI is available via that `npx` prefix. Cache the command
   (`LINEAR`) and use it for every later CLI call.

**If both unavailable: STOP.** Tell the user:

> Cannot pick up a ticket — neither the Linear MCP nor the Linear CLI is
> available. Authenticate the Linear MCP or install `linear` (`npx @schpet/linear-cli`),
> then re-run `/implement`.

Do not continue. Do not fetch "from the URL in chat." Do not invent AC.

Prefer MCP when it is authenticated; otherwise use `$LINEAR`. Do **not** guess MCP
tool names — list the Linear server's tools (or read schemas) first, then call the
get-issue / get-issue-by-identifier tool.

Do **not** run `linear issue start` — it creates a branch in the current checkout
instead of a worktree.

---

## Intake: Fetch the ticket ID, description, and acceptance criteria directly from Linear

Resolve `LINEAR_KEY` (`[A-Z]{2,10}-\d+`) from, in order:

1. The user's message (bare key, or a `https://linear.app/.../issue/KEY/...` URL).
2. The current branch name.
3. `$LINEAR issue id` if the CLI is available.

If none: AskUserQuestion for the key. Do not guess.

Fetch the issue. Capture:

| Field | Source |
|-------|--------|
| Identifier, title, URL | issue payload |
| Description | issue description (full text, not a paraphrase you cannot cite) |
| Acceptance criteria | `## Acceptance Criteria` / `AC` / `Done when` section; else numbered/bulleted requirements in the description |
| State, assignee, labels | issue payload |
| Branch name | `gitBranchName` / `branchName` if present; else `{KEY}-{kebab-case-title}` (lowercase, strip punctuation, max ~60 chars) |

If AC is not explicit, derive pass/fail criteria from the description and label
them **Derived (not explicit in ticket)**. If the ticket is too vague to execute
(no observable outcome), ask at most 3 clarifying questions, then proceed.

Echo a short intake card (key, title, URL, state, AC as a checklist) and continue.

Mark the issue **In Progress** and assign to self when that is a no-op against
current state (`$LINEAR issue update KEY --state "In Progress" --assignee self`,
or the MCP equivalent). If the update fails, note it and continue — do not stop.

---

## Setup: ticket-named worktree

A checkout is "named for the ticket" when the current **branch** or **worktree
directory** contains `LINEAR_KEY` (case-insensitive). Check:

```bash
git branch --show-current
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
command -v wt && wt list
```

**Already named for the ticket:** skip the question, work here.

**Otherwise:** AskUserQuestion:

- **A (recommend):** Create a dedicated worktree on `{branch name from Intake}`.
- **B:** Stay in this checkout. (If this is the default branch, say you will still
  `git switch -c` the ticket branch in place so we never commit to default.)

Do not create a worktree until they pick A.

### Creating the worktree (only if they said yes)

Detect the default branch (`git symbolic-ref refs/remotes/origin/HEAD`, fallback
`main` then `master`). Fetch it.

**Prefer Worktrunk** when `wt` is on PATH:

```bash
wt switch --create <branch> --no-cd --format=json
```

Stdout JSON `path` is the worktree. If the branch already exists, retry without
`--create`. Then do all subsequent file and shell work in that path (`cd` /
`working_directory` / `git -C`). Do not trust a bare `cd` to persist across turns
— pin commands to the worktree path.

**Fallback** (no `wt`):

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
REPO_NAME=$(basename "$REPO_ROOT")
git fetch origin
git worktree add -b <branch> "$REPO_ROOT/../$REPO_NAME-<LINEAR_KEY>" origin/<default>
```

If the path already exists, reuse it (`git worktree add <path> <branch>` without
`-b`, or just `cd` there). Report the worktree path and branch, then continue.

If they picked B on a default branch: `git switch -c <branch>` in place (stash
first only if the working tree is dirty and the switch would fail — ask before
stashing).

---

## Planning: Explore the codebase and construct a structured technical implementation plan before coding

Mandatory: read the code before proposing the plan. Grep/Glob/Read until you can
cite real files. Do not ask "which file should I look at?" — find it.

If you find nothing related, say so: "Treating this as greenfield; searched X, Y, Z."

Then write the plan. Do **not** start implementation in the same breath as the
first exploratory grep — the plan is a separate artifact the user can interrupt.

```
## Implementation plan — {KEY}: {title}

**Goal:** {one sentence}

**Acceptance criteria:**
1. {pass/fail}
2. ...

**Current state:** {what exists today, with `path` citations}

**Approach:** {the how, including patterns already in the repo to copy}

**Steps:**
1. ...
2. ...

**Files:**
| File | Change |
|------|--------|

**Tests:** {what to add or run, in the project's existing harness}

**Out of scope:** {adjacent work we will not do}
**Risks:** {what breaks if this is wrong}
```

Present the plan, then proceed to Implementation unless you are blocked
(ambiguous AC, a genuine design fork, or the ticket should be split). Do **not**
AskUserQuestion to rubber-stamp an obvious plan.

---

## Implementation: Execute changes step-by-step in a dedicated working environment or branch

Work only in the Setup worktree/branch. Execute the plan's steps in order.

- Minimal diff. Match existing patterns, names, and test style.
- No drive-by refactors, dependency bumps, or files the plan did not name.
- Leave the tree committable for `/ship` — do not commit here unless the user
  asked. `/ship` will split commits.
- After each step, sanity-check the files you touched (read them; fix what you
  just broke) before starting the next step.

If a step reveals the plan is wrong, update the plan in one short note and
continue — do not silently change scope.

---

## Validation: Run project checks and tests, auto-fixing minor review issues if necessary. If available, run the /review-bugbot skill and remediate any issues

### Tests and checks

Detect and run the project's test/check commands (run every suite that applies):

- `package.json` `test` / `lint` / `typecheck` (or `check`) scripts → detected
  package manager (`pnpm` / `yarn` / `npm` from the lockfile)
- Rails / Ruby → `bin/rails test` (or `bundle exec rspec` if `spec/` exists)
- Python → `pytest`
- Go → `go test ./...`
- `Makefile` `test` target → `make test`

If a suite fails with something cheap (lint, import, typo, missing test
assertion you just omitted), **fix it and re-run**. If it fails with a real
product bug, fix that too when it is in scope of the ticket. If it is unrelated
and non-trivial, **STOP** and show the failure.

If no test command exists and the project clearly has tests, **STOP**.

### Bugbot (if available)

Available when `~/.cursor/skills-cursor/review-bugbot/SKILL.md` exists **or** this
session can launch a `bugbot` subagent. If neither, print `Bugbot skipped — not
available in this session.` and continue.

Otherwise read that skill and launch **exactly one** `bugbot` subagent:

- `run_in_background: false`
- `description: "Bugbot"`
- `subagent_type: "bugbot"`

Prompt shape (no extra fields unless the skill requires them):

```text
Full Repository Path: <absolute worktree path>
Diff: branch changes
```

If the subagent fails, retry once with the same prompt. If it fails again, note
the error and continue — do not loop.

**Remediate:** unlike a standalone `/review-bugbot` run, this skill **does** fix
findings. Apply fixes for real bugs and clear defects. Skip style nits and
theoretical completeness. Then re-run Bugbot **once**. If the second pass still
has issues, report them in a table (Severity, Location, Finding) and continue —
do not loop.

Auto-fix remaining minor issues (unused imports, obvious typos, broken
formatting in files you touched). Do not expand scope.

---

## Syncing: Ask the user if they'd like to ship - if they say yes, run the /ship skill. If they mention "draft" be sure to set the PR that was opened to draft mode

Summarize: key, branch, worktree path, AC checklist (met / not), test result,
Bugbot result.

AskUserQuestion:

- **A (recommend):** Ship now (`/ship` — commit, push, open PR).
- **B:** Ship as **draft** (`/ship`, then convert the PR to draft).
- **C:** Not yet — leave the work in this worktree/branch.

Treat any free-text "yes" as A, unless they mention **draft** (case-insensitive)
— that is B. "No" / "later" / "don't ship" is C.

### If they ship (A or B)

Read the resolved `/ship` skill and run it to completion in this worktree. Do
not skip its tests or pre-landing review.

**Draft (B, or they mentioned "draft"):** after `/ship` prints the PR URL,
convert that PR to draft. Do this even if `/ship` opened it as ready.

- GitHub: `gh pr ready --undo` (current branch) or `gh pr ready <n> --undo`.
- Gitea: use the Gitea MCP update-PR tool with draft/WIP if it exists.
- If conversion fails, say so and give the PR URL — do not silently leave it
  ready without telling them.

Then print the PR URL (and "draft" if converted). That is the finish line.

### If they do not ship

Print the branch, worktree path, and that they can `/ship` later. Stop.

---

## Rules

1. **No Linear → no run.** MCP or CLI. Nothing else.
2. **Ticket is the spec.** Do not add features the AC does not require.
3. **Plan before code.** The plan cites files you actually read.
4. **One worktree, one ticket.** All edits go in the Setup checkout.
5. **Tests are not optional** when the project has them.
6. **Bugbot findings get fixed** on this workflow (then one re-run).
7. **Ship only on request.** Draft means the opened PR is draft, not a different
   pipeline.
8. **Never force-push. Never commit secrets.**

## Handoff

- **Before `/implement`:** if the work is not filed yet, `/spec` first.
- **After a shipped PR:** `/pr-review` is for someone else's PR, not this one.
- **The `/spec` → `/implement` → `/ship` loop:** `/spec` files the Linear
  issue; this skill executes it on a `KEY-…` branch; `/ship` opens the PR.
