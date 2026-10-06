---
name: review-renovate
version: 2.0.0
description: |
  Review every open Renovate dependency PR in a repo (or a named subset) with
  one isolated subagent per PR: inventory the bumps, fetch changelogs for
  breaking changes, map them to this repo's call sites, flag regressions
  existing tests would miss, read CI, and give each PR a CLEAR / CAUTION /
  BLOCK verdict. Then, only after your go-ahead on the exact list, fix CI
  failures, approve, and merge the verified PRs. Use when asked to "review the
  renovate PRs", "clear the renovate backlog", "check this renovate PR", "why
  didn't renovate automerge", given a Renovate PR URL, or "/review-renovate".
disable-model-invocation: true
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Task
  - AskUserQuestion
---

# Review Renovate

Target: `$ARGUMENTS` — a PR URL, PR numbers, or nothing (= all open Renovate PRs in this
repo). Not a style review, not a generic PR review.

Three phases: **review** (read-only, parallel) → **approval gate** → **act** (fix CI,
approve, merge). You are a thin parent: you list, dispatch, collect, gate, and merge. You do
not analyze changelogs or call sites yourself.

## Write rules

Review is read-only: no approve, comment, check out, commit, push, or file edits.

Every write — pushing a fix, approving, merging — happens only in the act phase, only for the
PRs and actions the user approved at the gate. A go-ahead for one PR is not one for the next
batch. Never use `--admin`, bypass branch protection, or merge anything pending, failing, or
unverified. Approvals carry an empty body. Any fix commit message goes through
`use-conversational-language`.

## Phase 1: Review

### 1. Resolve the host and the list

Host from `git remote get-url origin` (or the PR URL): `github.com` → **`gh`**; any other
host → **`tea`**. No GitHub/Gitea MCP. Don't guess flags — check `--help`. If the CLI is
missing, say so and stop (the act phase needs it too).

`git fetch` first, never `git pull`. Target branch = each PR's base.

List with `gh pr list --author "app/renovate" --state open --json number,title,headRefName,isDraft,labels,url`
(fall back to head branch prefix `renovate/` when the author filter returns nothing). Skip the
Dependency Dashboard issue and drafts (list drafts as skipped). Non-Renovate PRs in an explicit
target list: report "not a Renovate bump — use `/review` or `/pr-review`" and skip. Dependabot
is out of scope.

Zero PRs → say so and stop.

### 2. Dispatch one worker per PR

One isolated subagent per PR (`Task` / Claude Code `Agent`), launched in parallel, at most ~6
at a time. Each worker is fresh and independent; never resume across PRs. If the harness
can't isolate, run PRs sequentially in the parent following **Worker procedure** below, and
say so.

Worker prompt (fill placeholders):

```
Read and follow the "Worker procedure" section of the review-renovate SKILL.md
(same skill collection). Review-only: no approve, comment, checkout, commit, push, or edits.

PR: <url or number>
Repo: <owner/repo>
CLI: <gh|tea>

Return ONLY the report block from the procedure, plus the "Fix" and "Merge-ready" lines.
```

Collect every report. Print each one in the fixed shape — all findings, no summarizing away.

### 3. Summary table

After the reports, one table, ordered security first, then merge-ready, then the rest:

| PR | Bumps | Verdict | State | Next action |
| --- | --- | --- | --- | --- |

State is one of: **ready** (CI green, verified), **fixable** (CI red, diagnosed fix), **waiting**
(checks pending / stability days), **blocked**, **needs human**.

## Phase 2: Approval gate

Print the exact proposed actions, per PR, from the table:

- `#12 approve + merge`
- `#15 push CI fix (<one-line what>), then re-check; approve + merge only if green`

Ask once with `AskUserQuestion` which to run (all / pick PRs / none). Anything the user doesn't
select stays untouched. If the user already named the actions in the invocation ("review and
merge the clear ones"), that covers only PRs the reports put in **ready** — still show the list
before acting.

## Phase 3: Act

Work PRs in the order approved: security first, then fewest-files-first.

**Fix CI** (fixable PRs): one isolated worker per PR, in its own git worktree (never the
user's working tree). It checks out the PR head, applies the diagnosed fix, verifies with the
install / test / build / lint commands **that actually exist in this repo**, pushes to the
PR branch, and returns the outcome. If verification fails or the cause turns out different, it
stops without pushing and reports. Renovate-owned lockfile conflicts: ask Renovate to rebase
(`gh pr comment` only with approval of that wording) rather than hand-resolving, unless the
user chose otherwise.

**Approve + merge** (serial, in the parent). Before each PR, re-read it:

```
gh pr view <N> --json state,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,headRefOid
```

Proceed only if the head SHA matches what was reviewed (or the CI-fix worker pushed it), the
PR is mergeable with no conflicts, and every **required** check has completed and passed.
Then `gh pr review --approve <N>` (empty body) → `gh pr merge <N>` with the method the repo
allows (if several, match recent merged PRs; if unclear, ask). After each merge, the base has
moved: later PRs may now conflict or have stale checks — re-read, don't assume. A PR that
regressed to pending/failing/conflicted is reported, not merged.

If a PR needs approval from someone else, or approving your own push is blocked, stop on that
PR and report.

## Final report

```
Merged: #N <pkg from→to>, …
Fixed + pushed (not merged): #N <what>, …
Waiting: #N <why — pending checks, stability days, rebase requested>
Blocked / needs human: #N <why>
Skipped: #N <draft | not renovate | not approved>
```

Terse. No preamble, no padding.

---

## Worker procedure (one PR, read-only)

You are checking one Renovate bump. The question: is it safe to merge — breaking changes that
hit *this* codebase, regressions existing tests would not catch, and PR/CI hygiene that would
block a merge? Do not check out another branch or edit files; analyze from fetch + `gh pr view`
/ `gh pr diff` + CI. If this worktree already *is* the bump branch, a cheap local test run is
allowed; otherwise say local tests were skipped.

### W1. Confirm it is a Renovate bump

In scope if author is `renovate[bot]` / `renovate`, branch starts with `renovate/`, or body /
labels are from Renovate ("This PR contains the following updates", `renovate` label). If none
hold, return: **This is not a Renovate dependency bump. Use `/review` or `/pr-review`.**

### W2. Inventory the bumps

Parse the PR diff of manifests and lockfiles: Node (`package.json`, `package-lock.json`,
`pnpm-lock.yaml`, `yarn.lock`), Ruby (`Gemfile*`), Python (`pyproject.toml`,
`requirements*.txt`, `poetry.lock`, `uv.lock`), Go (`go.mod`, `go.sum`), Docker
(`Dockerfile`, `docker-compose*.yml`), Actions (`.github/workflows/*`, pins).

Per package: **name**, **from → to**, **class** (major / minor / patch / non-semver),
**direct vs lockfile-only/transitive**. Manifest for direct pins; lockfile for resolved
versions and transitives.

**Security first:** flag a PR as security if Renovate labels it (`security`, vulnerability
alerts in the body) or the notes cite a CVE/advisory.

**Why it didn't automerge** — one line from the PR body, Renovate comments, check status, and
in-repo Renovate config (`renovate.json`, `renovate.json5`, `.github/renovate.json`,
`package.json#renovate`). Typical: major bump, group PR, failed checks, conflict,
`stabilityDays`, `automerge: false`, lockfile error. Config you did not read → label it a
hypothesis.

### W3. Breaking changes

For each **direct** bump and any **transitive major** that looks load-bearing (runtime, HTTP
client, ORM, auth, bundler plugin used here): fetch notes **between** the old and new versions.
Never invent notes you did not fetch. Prefer, in order: GitHub/Gitea releases or tags (`gh
release` / `gh api`; `curl` the changelog on Gitea) → upstream `CHANGELOG*` / `HISTORY` between
those tags → registry metadata (`npm view <pkg> version repository homepage`, RubyGems / PyPI
JSON, Go proxy / tags).

Depth by class: **patch** — quick skim for CVEs and "breaking in a patch"; **minor** — new
features and behavior/default changes; **major** — breaking changes, migration guide.

Extract only: BREAKING / removed or renamed APIs, default-behavior changes, peer / engine /
runtime bumps, config key changes, security advisories. Check **peer dependency
compatibility** against the other deps in this repo. Don't dump the changelog.

Notes can't be fetched → **CAUTION**, or **BLOCK** for a major. Never a silent pass.

### W4. Map to this repo

Grep real usage (imports, requires, wrappers, config, type imports); map each breaking item to
`file:line`. No usages of a direct dep → say whether it looks unused or loaded dynamically / by
string. A breaking API this repo never calls is not a blocker: "upstream breaking, unused
here."

### W5. Test-blind regressions

Scope gap-thinking to the bumped APIs and their call sites only — no repo-wide audit, no
writing tests (point to `/testing-gaps`). Flag: call sites with no test that would go red if
the contract changed; tests that mock the dependency itself; snapshot-only or "does not raise"
coverage; relied-on behavior (retry, timeout, sort order, error shape, default headers) left
unasserted. Green CI is evidence, not a verdict.

### W6. Hygiene and CI

`gh pr view <N> --json mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,headRefOid`
and `gh pr checks <N>`. Blockers: conflicts with the base; failing or missing **required**
checks; unresolved human review threads that branch protection cares about; license / engine /
native-addon / postinstall surprises in the notes; manifest and lockfile out of sync. Ignore
Renovate's own dashboard noise unless it reports a failure.

**Failing CI:** read the failed logs (`gh run view <id> --log-failed`), identify the cause
(this bump vs. flaky/pre-existing on the base), and note any conflict. Draft the fix — which
files, what change, and which of this repo's real install/test/build/lint commands verify it.
Do not apply it.

**Pending CI** is not green: state *waiting*.

### W7. Report

```
Renovate review: #<N> <package(s) from→to> — <CLEAR | CAUTION | BLOCK> [security]
Why it didn't automerge: <one line>
Bumps: <name from→to (class, direct|transitive); …>
Breaking: <none, or item → call site file:line, or "upstream, unused here">
Test-blind regressions: <none, or call site + what wouldn't catch it>
Hygiene: <CI, conflicts, required checks>
Verdict: <one sentence: merge, wait, or what to verify>
Fix: <none, or diagnosed cause + proposed change + verifying commands>
Merge-ready: <yes @ <headRefOid> | no — why>
```

**BLOCK** — a known break maps to this repo; required CI failed or missing; conflicts; or a
**major** with no changelog fetched.

**CAUTION** — possible break; untested call sites; incomplete notes on a non-major; hygiene
worth a human glance.

**CLEAR** — notes fetched, no mapped break, tests/CI not contradicting, hygiene clean.

Several packages in one PR: verdict is the worst of the set. **Merge-ready: yes** requires
CLEAR, all required checks completed and passing, no conflicts. Only CLEAR is ever merge-ready;
CAUTION needs the user's call at the gate.
