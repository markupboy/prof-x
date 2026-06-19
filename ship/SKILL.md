---
name: ship
version: 1.0.0
description: |
  Ship workflow: merge main, run tests, review diff, bump VERSION, update CHANGELOG, commit, push, create PR.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
---

# Ship: Fully Automated Ship Workflow

You are running the `/ship` workflow. This is a **non-interactive, fully automated** workflow. Do NOT ask for confirmation at any step. The user said `/ship` which means DO IT. Run straight through and output the PR URL at the end.

**Only stop for:**

- On `main` branch (abort)
- Merge conflicts that can't be auto-resolved (stop, show conflicts)
- Test failures (stop, show failures)
- Pre-landing review finds CRITICAL issues and user chooses to fix (not acknowledge or skip)
- MINOR or MAJOR version bump needed (ask — see Step 4)

**Never stop for:**

- Uncommitted changes (always include them)
- Version bump choice (auto-pick PATCH — see Step 4)
- CHANGELOG content (auto-generate from diff)
- Commit message approval (auto-commit)
- Multi-file changesets (auto-split into bisectable commits)

---

## Step 1: Pre-flight

1. Check the current branch. If on `main`, **abort**: "You're on main. Ship from a feature branch."

2. Run `git status` (never use `-uall`). Uncommitted changes are always included — no need to ask.

3. Run `git diff main...HEAD --stat` and `git log main..HEAD --oneline` to understand what's being shipped.

---

## Step 2: Rebase origin/main (BEFORE tests)

Fetch and rebase `origin/main` into the feature branch so tests run against the rebased state:

```bash
git fetch origin main && git rebase origin/main
```

**If there are merge conflicts:** Try to auto-resolve if they are simple (VERSION, schema.rb, CHANGELOG ordering). If conflicts are complex or ambiguous, **STOP** and show them.

**If already up to date:** Continue silently.

---

## Step 3: Run tests (on rebased code)

Detect the project's test command and run it directly, then check the exit status. Use the first that applies (run more than one if the repo is polyglot):

- `package.json` with a `test` script → run with the detected package manager (`pnpm test` / `yarn test` / `npm test`; pick based on the lockfile present)
- Rails / Ruby (`bin/rails`, `Rakefile`, `Gemfile`) → `bin/rails test` (or `bundle exec rspec` if `spec/` exists)
- Python (`pytest.ini`/`pyproject.toml`/`tests/`) → `pytest`
- Go (`go.mod`) → `go test ./...`
- A `Makefile` with a `test` target → `make test`

Run each detected suite and capture its exit code and the tail of its output.

**If any suite exits non-zero (or no test command can be detected and the project clearly has tests):** Show the failures and **STOP**. Do not proceed.

**If all pass:** Continue silently — just note the counts briefly for the PR body.

---

## Step 3.5: Pre-Landing Review

Review the diff for structural issues that tests don't catch.

1. Resolve and read the checklist — its install location varies, so find the first path that exists:

   ```bash
   ls .claude/skills/review/checklist.md \
      ~/.claude/skills/review/checklist.md \
      ~/.claude/skills/prof-x/review/checklist.md 2>/dev/null | head -1
   ```

   Read the first hit. If none of the paths exist, **STOP** and report the error.

2. Run `git diff origin/main` to get the full diff (scoped to feature changes against the freshly-fetched remote main).

3. Detect which stack layers apply from the files changed (Ruby/Rails, TypeScript/Node), then apply the review checklist in two passes:
   - **Pass 1 (CRITICAL):** the CRITICAL core items plus the CRITICAL items of any applicable stack layer
   - **Pass 2 (INFORMATIONAL):** all remaining categories (core + applicable stack layers)

4. **Always output ALL findings** — both critical and informational. The user must see every issue found.

5. Output a summary header: `Pre-Landing Review: N issues (X critical, Y informational)`

6. **If CRITICAL issues found:** For EACH critical issue, use a separate AskUserQuestion with:
   - The problem (`file:line` + description)
   - Your recommended fix
   - Options: A) Fix it now (recommend), B) Acknowledge and ship anyway, C) It's a false positive — skip
     After resolving all critical issues: if the user chose A (fix) on any issue, apply the recommended fixes, then commit only the fixed files by name (`git add <fixed-files> && git commit -m "fix: apply pre-landing review fixes"`), then **STOP** and tell the user to run `/ship` again to re-test with the fixes applied. If the user chose only B (acknowledge) or C (false positive) on all issues, continue with Step 4.

7. **If only non-critical issues found:** Output them and continue. They will be included in the PR body at Step 8.

8. **If no issues found:** Output `Pre-Landing Review: No issues found.` and continue.

Save the review output — it goes into the PR body in Step 8.

---

## Step 4: Version bump (auto-decide)

1. Read the current `VERSION` file (3-digit semver: `MAJOR.MINOR.PATCH`). If there is no version file or it's unreadable, **SKIP THIS STEP**.

2. **Auto-decide the bump level based on the diff:**
   - Count lines changed (`git diff origin/main...HEAD --stat | tail -1`)
   - **PATCH** (3rd digit): bug fixes, small-to-medium changes, typos, config — auto-pick this by default
   - **MINOR** (2nd digit): **ASK the user** — only for new features or significant additions
   - **MAJOR** (1st digit): **ASK the user** — only for milestones or breaking changes

3. Compute the new version:
   - Bumping a digit resets all digits to its right to 0
   - Example: `0.19.1` + PATCH → `0.19.2`; `0.19.1` + MINOR → `0.20.0`

4. Write the new version to the `VERSION` file.

---

## Step 5: CHANGELOG (auto-generate)

1. Read `CHANGELOG.md` header to know the format. If there is no version file or it's unreadable, **SKIP THIS STEP**.

2. Auto-generate the entry from **ALL commits on the branch** (not just recent ones):
   - Use `git log main..HEAD --oneline` to see every commit being shipped
   - Use `git diff main...HEAD` to see the full diff against main
   - The CHANGELOG entry must be comprehensive of ALL changes going into the PR
   - If existing CHANGELOG entries on the branch already cover some commits, replace them with one unified entry for the new version
   - Categorize changes into applicable sections:
     - `### Added` — new features
     - `### Changed` — changes to existing functionality
     - `### Fixed` — bug fixes
     - `### Removed` — removed features
   - Write concise, descriptive bullet points
   - Insert after the file header (line 5), dated today
   - Format: `## [X.Y.Z] - YYYY-MM-DD`

**Do NOT ask the user to describe changes.** Infer from the diff and commit history.

---

## Step 6: Commit (bisectable chunks)

**Goal:** Create small, logical commits that work well with `git bisect` and help LLMs understand what changed.

1. Analyze the diff and group changes into logical commits. Each commit should represent **one coherent change** — not one file, but one logical unit.

2. **Commit ordering** (earlier commits first):
   - **Infrastructure:** migrations, config changes, route additions
   - **Models & services:** new models, services, concerns (with their tests)
   - **Controllers & views:** controllers, views, JS/React components (with their tests)
   - **VERSION + CHANGELOG:** always in the final commit

3. **Rules for splitting:**
   - A model and its test file go in the same commit
   - A service and its test file go in the same commit
   - A controller, its views, and its test go in the same commit
   - Migrations are their own commit (or grouped with the model they support)
   - Config/route changes can group with the feature they enable
   - If the total diff is small (< 50 lines across < 4 files), a single commit is fine

4. **Each commit must be independently valid** — no broken imports, no references to code that doesn't exist yet. Order commits so dependencies come first.

5. Compose each commit message:
   - First line: `<type>: <summary>` (type = feat/fix/chore/refactor/docs)
   - Body: brief description of what this commit contains
   - Only the **final commit** (VERSION + CHANGELOG) gets the version tag and co-author trailer:

```bash
git commit -m "$(cat <<'EOF'
chore: bump version and changelog (vX.Y.Z)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Step 7: Push

Push to the remote with upstream tracking:

```bash
git push -u origin <branch-name>
```

---

## Step 8: Create PR

Pick the PR host based on the remote — repos here are a mix of GitHub and Gitea:

```bash
git remote get-url origin
```

- If the host is `github.com` → create the PR with `gh` (below).
- If the host is a Gitea instance (anything else self-hosted) → parse `owner` and `repo`
  from the remote URL and create the PR with the Gitea MCP tool
  `mcp__gitea__create_pull_request` (`base` = the repo's default branch, `head` = the
  current branch, `title`/`body` as built below). If the Gitea host can't be determined,
  fall back to `gh`.

Build the title and body once, then pass them to whichever path applies:

- **Title:** `<type>: <summary>`
- **Body:**

```
## Summary
<bullet points from CHANGELOG>

## Pre-Landing Review
<findings from Step 3.5, or "No issues found.">

## Test plan
- [x] All tests pass (<detected suites>, 0 failures)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

GitHub path:

```bash
gh pr create --title "<type>: <summary>" --body "<body>"
```

**Output the PR URL** — this should be the final output the user sees.

---

## Important Rules

- **Never skip tests.** If tests fail, stop.
- **Never skip the pre-landing review.** If checklist.md is unreadable, stop.
- **Never force push.** Use regular `git push` only.
- **Never ask for confirmation** except for MINOR/MAJOR version bumps and CRITICAL review findings (one AskUserQuestion per critical issue with fix recommendation).
- **Always use the 3-digit semver format** (`MAJOR.MINOR.PATCH`) from the VERSION file.
- **Date format in CHANGELOG:** `YYYY-MM-DD`
- **Split commits for bisectability** — each commit = one logical change.
- **The goal is: user says `/ship`, next thing they see is the review + PR URL.**
