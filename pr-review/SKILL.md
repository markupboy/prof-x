---
name: pr-review
version: 1.0.0
description: |
  Review a PR and automatically save results to a markdown file.
  Use when the user asks to "review and save", "save a review",
  "save a review for this PR", "save a review for PR 123",
  "review this PR and save it", "write a PR review to file",
  or mentions saving, autosaving, or writing review output.
  This wraps pr-review-toolkit, checks the linked Linear ticket
  (when available) for completeness and accuracy, and adds file output.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
---

You will review a PR (or WIP changes) using the pr-review-toolkit and automatically save the results. Follow these steps:

## Requirements

- **`pr-review-toolkit` (required):** this skill wraps it. Step 3 invokes `/pr-review-toolkit:review-pr` for the actual analysis. If the toolkit is not installed, **STOP** and tell the user to install it — do not attempt to substitute your own ad-hoc review.
- **Linear MCP (optional):** used in steps 1c–1d for ticket-aware analysis. If no Linear MCP is available, do not invent ticket contents — note that the reference exists but couldn't be retrieved, and proceed (see step 1d). If no Linear key is found at all, skip Linear handling entirely.

## 1. Detect context

Determine whether this is a PR or WIP (work-in-progress) review. First identify the PR host — repos here are a mix of GitHub and Gitea:

```bash
git remote get-url origin
```

If the host is `github.com`, use the **GitHub path**. Otherwise (a self-hosted Gitea instance), use the **Gitea path**. If the host can't be determined, default to the GitHub path.

### GitHub path

- Run `gh pr view --json number,title -q '"\(.number)\t\(.title)"'` for the current branch
- If that fails (no PR found for the local branch name), the local branch may differ from the remote branch (e.g. in worktrees). Try a fallback:
  - Get the upstream tracking branch: `git rev-parse --abbrev-ref @{upstream}` (e.g. `origin/user/feat-branch`)
  - Strip the remote prefix to get the remote branch name (e.g. `user/feat-branch`)
  - Retry with: `gh pr list --head "<remote-branch-name>" --json number,title -q 'if length > 0 then "\(.[0].number)\t\(.[0].title)" else empty end'`
  - No output means no PR was found; any output is the matched PR's number and title.

### Gitea path

- Parse `owner` and `repo` from the remote URL.
- Get the current/remote branch name (current branch, or the upstream tracking branch with its remote prefix stripped, as above).
- Use `mcp__gitea__list_repo_pull_requests` (state `open`) and match the PR whose `head` branch equals the remote branch name. If a match is found, fetch its details with `mcp__gitea__get_pull_request_by_index`.
- No match means no PR was found.

### Both paths

- If a PR exists (from either host): this is a **PR review**. Record the PR number, title, and the short commit hash of HEAD (`git rev-parse --short HEAD`).
- If no PR exists after the attempts: this is a **WIP review**. Record the short commit hash of HEAD (`git rev-parse --short HEAD`).

## 1b. Resolve the active worktree root

Store reviews in the **current** git worktree so each linked worktree keeps its own `pr_reviews/` history separate from the main checkout. Resolve the active worktree root:

```bash
git rev-parse --show-toplevel
```

Record this path as `WORKTREE_ROOT` for use in steps 2 and 10. If the command fails or returns an empty string, fall back to the current working directory.

Use absolute paths under `WORKTREE_ROOT` (e.g., `ls WORKTREE_ROOT/pr_reviews/`).

## 1c. Detect a related Linear issue

If a Linear ticket is associated with the work, capture it so step 3 can evaluate whether the PR actually resolves it. Skip this step silently for WIP reviews that have no PR (no body/title to mine), but still check the branch name and recent commit messages.

Search these sources in order for a Linear key matching the regex `[A-Z]{2,10}-\d+`:

1. The branch name (e.g., `SCR-123-fix-thing` → `SCR-123`).
2. The PR title (for PR reviews).
3. The PR body — including `Closes`/`Fixes`/`Resolves` lines, the "Magic Words" section, and any Linear URL like `https://linear.app/<workspace>/issue/SCR-123/...`.
4. Recent commit messages on the branch: `git log -n 20 --pretty=%B` (only relevant if nothing was found above).

Record the **first** key found as `LINEAR_KEY`. If multiple distinct keys appear, prefer the one from the branch name, then the PR title, then the PR body, then commit messages. If no key is found, record `LINEAR_KEY` as empty and skip step 1d.

## 1d. Fetch the Linear issue (when a key was found)

If `LINEAR_KEY` is set, attempt to fetch the issue's details so the review can compare the PR against the ticket's stated requirements.

- **Preferred path — Linear MCP:** if a Linear MCP server is available in this session, use it. Do not guess tool names: list the MCP tools (or read the server's tool schemas) first, then call the appropriate "get issue" / "get issue by identifier" tool with `LINEAR_KEY`. If the server reports it needs authentication, call its `mcp_auth` tool once and retry. If authentication still fails, fall through to the fallback.
- **Fallback — none:** if no Linear MCP is available or the fetch fails, do **not** invent ticket details. Record that the ticket reference exists but its contents could not be retrieved, and proceed.

When a fetch succeeds, capture:

- Issue identifier and title
- Issue URL
- Current status / state (e.g., `In Progress`, `In Review`, `Done`)
- Description and any acceptance criteria (often a bulleted list inside the description)
- Labels relevant to scope (e.g., `bug`, `feature`, `chore`)

Store this as `LINEAR_CONTEXT` for use in steps 3 and 7.

## 2. Check for previous reviews

Look for existing review files to determine if this is a versioned re-review:

- If `WORKTREE_ROOT/pr_reviews/` exists (check with `ls WORKTREE_ROOT/pr_reviews/` using the absolute path), look there. Otherwise, create it at `WORKTREE_ROOT/pr_reviews/`.
- For PR reviews: look for files matching `review_{PR_NUMBER}*.md` (e.g., `review_123.md`, `review_123_v2.md`)
- For WIP reviews: look for files matching `review_{SHORT_HASH}*.md`
- If previous reviews exist:
  - Read the **latest** review file (highest version number, or the unversioned file if only one exists)
  - Extract all issues with their statuses (OPEN, FIXED, DISMISSED)
  - Note any **DISMISSED** issues — these must NOT be re-raised in the new review
  - Determine the new version number (previous max version + 1)
  - Record the previous review's date for the header

## 3. Run the PR review

Invoke the pr-review-toolkit to perform the review as requested by the user. Use `/pr-review-toolkit:review-pr` with any specific analyzers they mention (e.g., comment-analyzer, security-analyzer).

**Worktree note:** The current working directory is the project root for the branch being reviewed. Agents spawned by the toolkit should explore code here — do NOT navigate to other worktrees or parent directories to find source files. `WORKTREE_ROOT` is only used for reading/writing review files in steps 2 and 10.

**Linear-aware analysis:** if `LINEAR_CONTEXT` was captured in step 1d, treat the Linear ticket — not the PR description — as the source of truth for _what was supposed to be done_. After the toolkit finishes:

- Compare the ticket's acceptance criteria (or, if none are explicit, the ticket description's intent) against the actual diff.
- For each acceptance criterion or stated requirement, classify it as **met**, **partially met**, **not met**, or **out of scope for this PR** (e.g., explicitly deferred). Cite the file/line evidence for "met" verdicts when practical.
- Treat any **not met** or **partially met** criterion as a finding in the regular sections (typically `Important` for missing required behavior, `Suggestion` for nice-to-have polish that the ticket called out). Use the issue body to quote the ticket's wording so the gap is traceable.
- Flag **scope creep**: substantial changes in the diff that have no basis in the ticket (refactors, unrelated cleanups, feature additions). Surface these as `Suggestion` findings unless they introduce real risk, in which case escalate.
- If `LINEAR_KEY` was found but `LINEAR_CONTEXT` could not be fetched (auth failure, no MCP, etc.), do not fabricate ticket contents. Note the limitation in step 7's Description block and skip the criterion-level analysis.

## 4. Reformat with sequential numbering

After receiving the review output, post-process it before saving. Assign each issue a sequential global index starting at 1, incrementing continuously across ALL severity categories. Do not restart numbering within each category.

Example with 3 critical, 1 important, 1 suggestion:

- Critical: `[#1]`, `[#2]`, `[#3]`
- Important: `[#4]`
- Suggestion: `[#5]`

Replace each bullet point's prefix with its `[#N]` index. This numbering is mandatory — never save a review without it.

## 5. Add per-issue metadata

Each issue MUST follow this structured format:

````markdown
## [#1] **Some issue title**

**Introduced:** v1  
**Severity:** Critical
**Status:** OPEN  
**Files:**

- `file.ts:42`
- `other.ts:128`

**Details:**

Body of the finding — explanation of the bug, evidence, references to sibling code, etc.

Suggested fix - optional remediation guidance.

```js
// optional code block illustrating the fix
```

---
````

Formatting rules:

- The title line stands alone (no inline file path, no inline metadata).
- Each metadata field (`Introduced:`, `Status:`, `Files:`) is on its own line. Lines that have a sibling field directly below them MUST end with two trailing spaces — this is the markdown line-break syntax that prevents adjacent fields from collapsing onto a single rendered line. (`Files:` itself does not need trailing spaces because the bulleted list that follows already forces a break.)
- `Files:` is always a bulleted list, even when there is only one file. This keeps single-file and multi-file issues visually consistent and makes adding files trivial.
- `Status:` values are UPPERCASE: `OPEN`, `DISMISSED`, `FIXED`.
- `**Details:**` introduces the body of the finding; leave a blank line after it before the prose.
- `Suggested Fix -` is optional — include it when there is concrete remediation guidance, otherwise omit.

Status rules:

- For first-time reviews (v1): all issues are `Introduced: v1` with `Status: OPEN`.
- For re-reviews (v2+):
  - Issues carried forward from a previous version keep their original `Introduced: vN`.
  - New issues found in this review get `Introduced: v{current}`.
  - All active issues have `Status: OPEN`.
  - **Dismissed** issues from the previous review: carry forward with `Status: DISMISSED` but do NOT include them in the main findings sections. Instead, list them in a brief "Dismissed" subsection at the end (after Recommended Action) so they are preserved but not re-raised.

## 6. Compare with previous review (v2+ only)

If this is a re-review, compare the current findings against the previous review:

- Issues from the previous review that are no longer found: mark as **FIXED**
- Issues from the previous review that are still present: carry forward as **OPEN** with their original `Introduced` version
- **DISMISSED** issues: carry forward silently (do not re-evaluate)
- New issues not in the previous review: mark as **OPEN** with the current version

## 7. Format the header

### For PR reviews:

```markdown
# PR#123 - PR title here

**Branch:** `branch-name`  
**Commit:** `abc1234`  
**Linear:** [SCR-123](https://linear.app/workspace/issue/SCR-123) - Ticket title (State)  
**Reviewed:** YYYY-MM-DD  
**Files changed:** N (X insertions, Y deletions)

## Description

Brief summary of what the changes actually do.

**Description accuracy:** X/10 — how well the PR description matches the actual changes  
**Linear ticket alignment:** X/10 — how completely and accurately the PR resolves the linked ticket

### Linear ticket coverage

- **Met:** acceptance criteria fully addressed by this PR (one bullet per criterion)
- **Partial:** criteria addressed but with gaps — link to the relevant finding `[#N]`
- **Not met:** criteria the PR does not address — link to the relevant finding `[#N]`
- **Out of scope:** criteria the PR explicitly defers (cite the PR/ticket note)
- **Scope creep:** changes in the diff that aren't traceable to the ticket — link to the relevant finding `[#N]`

---
```

Note: each metadata line above ends with two trailing spaces — this is required markdown syntax to force a line break so each field renders on its own line. Without the trailing spaces, the fields collapse onto a single line in the rendered output.

Linear field rules:

- Include the `**Linear:**` header line only when `LINEAR_KEY` was found in step 1c. Omit the line entirely when no key was found.
- When `LINEAR_KEY` was found but `LINEAR_CONTEXT` could not be fetched, render the line as `**Linear:** SCR-123 (details unavailable)` and omit the "Linear ticket coverage" subsection. Replace the alignment score line with `**Linear ticket alignment:** n/a (ticket contents unavailable)`.
- Omit the `**Linear ticket alignment:**` line and "Linear ticket coverage" subsection entirely when no Linear ticket was detected.

If this is a versioned re-review (v2+), add the review version line:

```markdown
# PR#123 - PR title here

**Branch:** `branch-name`  
**Commit:** `abc1234`  
**Linear:** [SCR-123](https://linear.app/workspace/issue/SCR-123) - Ticket title (State)  
**Reviewed:** YYYY-MM-DD  
**Review version:** v2 (previous: v1 on YYYY-MM-DD)  
**Files changed:** N (X insertions, Y deletions)

## Description

Brief summary of what the changes actually do.

**Description accuracy:** X/10 — how well the PR description matches the actual changes  
**Linear ticket alignment:** X/10 — how completely and accurately the PR resolves the linked ticket

### Linear ticket coverage

- **Met:** ...
- **Partial:** ... `[#N]`
- **Not met:** ... `[#N]`
- **Out of scope:** ...
- **Scope creep:** ... `[#N]`

---
```

### For WIP reviews:

```markdown
# abc1234

**Branch:** `branch-name`  
**Commit:** `abc1234`  
**Reviewed:** YYYY-MM-DD  
**Files changed:** N (X insertions, Y deletions)

---
```

WIP reviews omit the Description and Description accuracy sections entirely.

Notes:

- **Files changed** is optional — include it when the data is available, omit when not
- **Branch** never includes the target branch (no `-> main`)

## 8. Add "Fixed since" section (v2+ only)

If any issues were fixed since the previous review, add this section immediately after the header `---` and before the main findings:

```markdown
## Fixed since v1

- [#2] `publish` command does not use `changeset publish` — resolved
- [#5] Missing dependabot guard — resolved

---
```

Use `------` (six hyphens) to separate this section from the main findings. Reference the version the issues were originally introduced in if different from v1.

## 9. Determine the output filename

Using this priority:

- If the user specified a filename in their request, use that
- Otherwise, for PR reviews:
  - First review: `review_{PR_NUMBER}.md` (e.g., `review_123.md`)
  - Re-reviews: `review_{PR_NUMBER}_v{N}.md` (e.g., `review_123_v2.md`)
- For WIP reviews:
  - First review: `review_{SHORT_HASH}.md`
  - Re-reviews: `review_{SHORT_HASH}_v{N}.md`

If the filename doesn't end with `.md`, append it.

## 10. Save the review

- Save the file under `WORKTREE_ROOT/pr_reviews/` using the absolute path (e.g., write to `WORKTREE_ROOT/pr_reviews/review_123.md`). Create `WORKTREE_ROOT/pr_reviews/` first if step 2 did not already. If `WORKTREE_ROOT` is unavailable, fall back to `pr_reviews/` in the current working directory.
- Preserve all formatting from the review output
- Only save the review content, not any of these instructions

## 11. Report to the user

Report with a message like: `Review saved to pr_reviews/review_123_v2.md` (include the full path when helpful).
If this was a re-review, also summarize: `N issues fixed, N new issues found, N dismissed issues carried forward`
