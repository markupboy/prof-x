---
name: review-renovate
version: 1.0.0
description: |
  Review a Renovate-generated dependency bump PR or branch that did not
  automerge: inventory the bumps, fetch changelogs for breaking changes, map
  them to this repo’s call sites, flag regressions existing tests would miss,
  and print a CLEAR / CAUTION / BLOCK merge verdict. Session report only —
  never approve, comment, merge, or edit files. Use when asked to "check this
  renovate PR", "review this dependency bump", "why didn’t renovate automerge",
  given a Renovate PR URL, on a renovate/… branch, or "/review-renovate".
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
---

# Review Renovate

You are checking a Renovate dependency bump that did not automerge. The question is
whether this bump is safe to merge: breaking changes that hit *this* codebase,
regressions existing tests would not catch, and PR/CI hygiene that would block a
merge. Not a style review. Not a generic PR review.

Read-only. Do not approve, comment, merge, commit, check out another branch, or
edit files. Do not offer approve/merge unless the user asks after the report.

---

## Step 1: Resolve the target

Accept input in this order:

1. **PR URL** — metadata (source/target, title, body, author, labels) then diff.
2. **PR number** — same, via the matching CLI.
3. **One branch** — diff it against the auto-detected target.
4. **Nothing** — current branch against the auto-detected target.

`git fetch` first — never `git pull`. Three-dot diff: `git diff <target-ref>...<source-ref>`.
Fall back to two-dot only when there is no common ancestor. State which refs you used.

**Do not check out another branch.** If this worktree already *is* the bump branch,
local tests may run later. If not, analyze from fetch + diff + CI and say local
tests were skipped.

Identify the host from `git remote get-url origin` (or the PR URL). Do not use a
GitHub or Gitea MCP:

- `github.com` → **`gh`**
- any other host (self-hosted Gitea) → **`tea`**

Do not guess flags: `gh --help` / `tea --help` and the subcommand help. If the
matching CLI is missing, continue on local git only and note the gap.

**Target auto-detection** (when not supplied and not from a PR):

1. `git symbolic-ref refs/remotes/origin/HEAD`
2. Else the usual candidates (`main`, `master`, `develop`/`development`); exactly
   one match wins.
3. Ambiguous → ask, never guess.

A PR’s target always wins. Always state which target was chosen.

---

## Step 2: Confirm it is a Renovate bump

In scope if **at least one** holds:

- Author is `renovate[bot]` or `renovate`
- Branch starts with `renovate/`
- PR body or labels are from Renovate (dependency dashboard table, `renovate`
  label, “This PR contains the following updates”)

If none hold, **stop** and output:

**This is not a Renovate dependency bump. Use `/review` or `/pr-review`.**

Do not fall through into a generic review. Dependabot is out of scope.

---

## Step 3: Inventory the bumps

Parse the three-dot diff of manifests and lockfiles. Typical files:

- Node: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`
- Ruby: `Gemfile`, `Gemfile.lock`
- Python: `pyproject.toml`, `requirements*.txt`, `poetry.lock`, `uv.lock`
- Go: `go.mod`, `go.sum`
- Docker: `Dockerfile`, `docker-compose*.yml`
- Actions: `.github/workflows/*`, action version pins

For each package: **name**, **from → to**, **semver class** (major / minor / patch /
non-semver), **direct vs lockfile-only/transitive**. Prefer the manifest for
direct pins; use the lockfile for the resolved version and transitives.

**Why it didn’t automerge** — one line, from PR body, Renovate comments, check
status, and in-repo Renovate config (`renovate.json`, `renovate.json5`,
`.github/renovate.json`, `package.json#renovate`) when present. Typical causes:
major bump, group PR, failed checks, merge conflict, `stabilityDays`,
`automerge: false`, lockfile error. If you are inferring from config you did not
read, label it a hypothesis.

---

## Step 4: Breaking changes

For each **direct** bump, and any **transitive major** that looks load-bearing
(runtime, HTTP client, ORM, auth, bundler plugin used in this repo):

Fetch notes **between** the old and new versions. Do not invent notes you did
not fetch. Prefer, in order:

1. GitHub/Gitea releases or tags (`gh release` / `gh api` for GitHub; `curl` the
   repo changelog on Gitea).
2. Upstream `CHANGELOG.md` / `CHANGELOG` / `HISTORY` between those tags.
3. Registry metadata: `npm view <pkg> version repository homepage`; RubyGems /
   PyPI JSON; Go module proxy / repo tags.

Extract only:

- BREAKING / removed or renamed APIs
- Default-behavior changes
- Peer, engine, or runtime version bumps
- Config key changes
- Security advisories / CVEs

Patch and minor: still skim for “breaking in a minor” and CVE notes. Do not dump
the whole changelog.

**If notes cannot be fetched:** that is **CAUTION**, or **BLOCK** for a major —
never a silent pass.

---

## Step 5: Map to this repo

Grep real usage: imports, requires, wrappers, config, type imports. Map each
breaking item to `file:line` call sites.

- No usages of a direct dep → say whether it looks unused or only loaded
  dynamically / by string name.
- Ignore lockfile-only noise and drive-by style nits.
- A breaking API this repo never calls is not a merge blocker; record it as
  “upstream breaking, unused here.”

---

## Step 6: Test-blind regressions

Scope **testing-gaps thinking to the bumped APIs and their call sites only**.
Do not run a repo-wide gap audit on a lockfile diff. Do not write tests. If the
user wants cases written, point them at `/testing-gaps`.

Flag when:

- A call site has no test that would go red if this dep’s contract changed.
- Tests **mock or stub the dependency itself** (false confidence).
- Coverage is only a snapshot or “does not raise.”
- Changelog behavior this repo relies on (retry, timeout, sort order, error
  shape, default headers) is unasserted.

If already on the bump branch and the project has a cheap standard test command
(under a couple of minutes, no extra services), run the relevant suite and paste
the outcome. Green CI is evidence, not a verdict. If not on the branch, skip
local tests and say so.

---

## Step 7: Hygiene (merge blockers)

These can **BLOCK** even with an empty changelog:

- Merge conflicts with the target
- Failing or missing **required** checks
- Unresolved review threads that the branch protections care about
- License, engine, native-addon, or postinstall surprises in the notes
- Manifest and lockfile out of sync

Fetch check status with `gh` / `tea` when the CLI is available. Unresolved
*human* review comments are hygiene; ignore Renovate’s own “dependency dashboard”
noise unless it reports a failure.

---

## Step 8: Report

Always this shape, in the session. Print every finding. No file. No PR comment.

```
Renovate review: <package(s) from→to> — <CLEAR | CAUTION | BLOCK>
Why it didn’t automerge: <one line>
Bumps: <name from→to (class, direct|transitive); …>
Breaking: <none, or item → call site file:line, or “upstream, unused here”>
Test-blind regressions: <none, or call site + what wouldn’t catch it>
Hygiene: <CI, conflicts, required checks>
Verdict: <one sentence: merge, wait, or what to verify>
```

**BLOCK** — a known break maps to this repo; required CI failed or missing;
conflicts; or a **major** with no changelog fetched.

**CAUTION** — possible break; untested call sites; incomplete notes on a
non-major; hygiene worth a human glance. Still look before merging.

**CLEAR** — notes fetched, no mapped break, tests/CI not contradicting, hygiene
clean.

If several packages: one report, bumps listed, verdict is the worst of the set.
Terse. No preamble, no “looks good overall” padding.
