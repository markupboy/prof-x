---
name: pr-review
version: 1.1.0
description: |
  Review a pull request or branch. Picks the depth from the diff size: under 400
  changed lines gets a light, local-text pass that suggests pasteable review comments;
  400 or more gets a full review that wraps pr-review-toolkit, checks the linked Linear
  ticket, and saves the results to a markdown file. Force a depth with
  "/pr-review light", "/pr-review full", or "/pr-review pedantic" (full without the
  realism filtering). Use when asked to "review this PR", "review this branch",
  "help me review this", "suggest review comments", "review and save", "save a review
  for PR 123", or "/pr-review".
argument-hint: "[light|full|pedantic] [PR URL | branch [target]]"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
---

# PR review

Review a PR, a branch, or WIP changes. The depth follows the size of the change:

- **light** — single pass, the project's convention docs open, only grounded findings, printed in the
  conversation. No file.
- **full** — the `pr-review-toolkit` analysis, severity-calibrated, ticket-aware, saved to
  `pr_reviews/`.
- **pedantic** — full without the realism filtering: every finding the analyzers raise is reported.

You suggest candidate comments; the human decides what to post. Nothing here posts to the PR.

## Requirements

- **`pr-review-toolkit` (full and pedantic only):** the full-mode review step invokes
  `/pr-review-toolkit:review-pr`. If the toolkit is not installed, **STOP** and tell the user to install
  it — do not substitute your own ad-hoc review. Light mode does not need it.
- **`linear` CLI (full and pedantic only, optional):** used in F2–F3 for ticket-aware analysis. If
  `linear` is not on PATH, do not invent ticket contents — note that the reference exists but couldn't
  be retrieved, and proceed (see F3). If no Linear key is found at all, skip Linear handling entirely.

## 1. Parse arguments

Pull an optional mode keyword out of the arguments, in any position: `light`, `full`, or `pedantic`.
Whatever is left is the review target spec (see step 2). Record `MODE_OVERRIDE` (empty when no keyword).

## 2. Resolve what to review

Accept input flexibly; a PR link is optional:

1. **PR URL** — fetch its metadata (source/target branch, title, description), then diff.
2. **One branch** ("review branch xxxx") — diff it against the auto-detected target.
3. **Two branches** ("review xxxx against yyyy") — explicit source and target.
4. **Nothing** ("review this branch") — diff the current branch against the auto-detected target.

(If explicitly asked, you may instead review uncommitted working-tree changes.)

### Platform and CLI

Identify the PR host from the URL, or from `git remote get-url origin` when there is none. If the host
is `github.com`, use **`gh`**; any other host (self-hosted Gitea) uses **`tea`**; if the host can't be
determined, default to `gh`. Do not use a GitHub or Gitea MCP. Do not guess flags: `gh --help` /
`tea --help` and the subcommand help. If the matching CLI is not on PATH: with a PR link, ask the user
whether to continue as a local-diff-only review (light) or stop; with no link, review locally. On Gitea
without `tea`, full and pedantic stop and tell the user to install it.

### Find the PR (when no URL was given)

- **GitHub:** `gh pr view --json number,title -q '"\(.number)\t\(.title)"'` for the current branch. If
  that fails (the local branch name may differ from the remote one, e.g. in worktrees), take the
  upstream tracking branch (`git rev-parse --abbrev-ref @{upstream}`), strip the remote prefix, and
  retry with `gh pr list --head "<remote-branch-name>" --json number,title -q 'if length > 0 then "\(.[0].number)\t\(.[0].title)" else empty end'`.
  No output means no PR.
- **Gitea:** parse `owner` and `repo` from the remote URL, take the current or upstream-stripped branch
  name, list open pulls with `tea` and match the PR whose head branch equals it.

A PR found: record its number, title, and the short commit hash of HEAD (`git rev-parse --short HEAD`).
No PR: this is a **WIP review**; record the short hash only.

### Diff base

Always a three-dot merge-base diff, `git diff <target-ref>...<source-ref>`, so it matches exactly what
the platform shows as the PR with no noise from commits that landed on target after the fork. Fall back
to two-dot only when there is no common ancestor. No checkout is needed to produce the diff.

### Branch freshness

Always `git fetch` first — never `git pull`: the diff needs no checkout or working-tree update. Then
diff each branch's freshest ref, stating which you used: the remote-tracking ref when the branch is on a
remote and the local ref isn't ahead of it; the local ref when the branch exists only locally or carries
unpushed commits (never silently review a stale pushed state); for a fork PR's source, absent from
`origin`, the fork remote or the platform's PR ref (e.g. `git fetch origin pull/<N>/head` on GitHub).
If a fetch fails or a ref can't be found, say so and ask how to proceed rather than review stale or
wrong refs.

### Target auto-detection

When the target is not supplied and not from a PR link, in order:

1. `git symbolic-ref refs/remotes/origin/HEAD` — the remote default branch.
2. Else check which usual candidates exist (`main`, `master`, `develop`/`development`); exactly one
   match wins.
3. Multiple matches or any ambiguity → ask, never guess.

A PR link always overrides auto-detection (its target comes from the PR metadata; PRs are not always
against the main branch). Always state which target was chosen so the user can correct it.

### Stacked PRs (GitHub)

A stacked PR's target is the branch below it in the stack, not the trunk; diffing against the default
branch would pull every lower layer into the review. On a `github.com` remote, check for a stack before
settling on the target. Skip this on Gitea.

- **PR review:** read the PR's base and head: `gh pr view <N> --json baseRefName,headRefName,url`. The
  base ref already is the parent branch: use it. Confirm membership with `gh stack view --json` when
  `gh stack` is installed and the stack is tracked locally (see `gh stack --help`), else with plain
  `gh`: the **parent** is the open PR whose head equals this PR's base (`gh pr list --head "<baseRefName>" --state all --json number,title,url`); the **children** are the open PRs whose base equals this PR's head (`gh pr list --base "<headRefName>" --json number,title,url`). Repeat to map the full chain.
- **No link, no explicit target:** a branch found in a stack takes its parent branch as the target,
  ahead of the `origin/HEAD` auto-detection above. For WIP, `gh stack view --json` showing the current
  branch in a stack makes the branch directly below the base.
- Not stacked: the base is the repo's default branch and no parent/child PR exists.

Record `TARGET` (the branch the change is diffed against). When `TARGET` is not the default branch,
also record `STACK_BASE` (= `TARGET`), the PR's position (e.g. `2 of 4`), and the parent and child PRs
with their numbers, titles, and URLs. When the base is not the default branch but no parent PR is found
(parent merged into the trunk, or a long-lived release branch), record `STACK_BASE` only and note that
it is not a stack: retarget to wherever the PR's base now points. Name the stack position and chosen
target in the output (e.g. "layer 2 of 4, against `parent-branch`"). Fetch the parent branch too, and
diff against its freshest ref per the freshness rules.

Review only this layer: no findings on lower layers' changes. Before raising a "missing" or
intent-mismatch finding, read the child PRs' titles and descriptions (`gh pr view <N> --json title,body`);
work a later layer clearly covers is not a finding — drop it or mention the dependency.

Only read-only stack commands: never run `gh stack checkout`, `sync`, `submit`, `modify`, `unstack`,
or `add`.

## 3. Pick the mode

Count the changed lines: the sum of insertions and deletions from
`git diff --numstat <target-ref>...<source-ref>`, leaving out lockfiles (`*.lock`, `package-lock.json`,
`pnpm-lock.yaml`, and the like), obvious generated output, and binary files (numstat shows `-`).

- `MODE_OVERRIDE` set → that mode.
- Else fewer than 400 changed lines → **light**; 400 or more → **full**. `pedantic` is never chosen
  automatically.

State the mode and the reason in one line before reviewing, e.g. `Mode: light (212 changed lines)` or
`Mode: full (forced by argument)`, so the user can re-run with a keyword if they disagree.

Full and pedantic run the toolkit against the **current checkout**. If the source branch is not the
checked-out HEAD, do not check anything out: tell the user and ask whether to switch to light (which
reads the diff directly) or have them check out the branch first.

## Boundaries

- **Read-only, two exceptions.** Only read-only git (`diff`, `log`, `show`, `merge-base`,
  `branch --list`, `symbolic-ref`) and read-only platform fetches (including `gh stack view` and
  `gh pr list/view`), plus `git fetch` (the only allowed ref update — never `git pull`). Never check
  out other branches, modify the working tree, or post/reply/resolve/vote on the PR. The one file write
  is the full/pedantic review file (F12); light writes nothing unless the user explicitly asks to save
  the output.
- **Fetch before reviewing.** Always `git fetch` the refs under review first so the diff reflects the
  latest commits. Nothing more: no checkout, no destructive ref ops, no prune, no clobbering
  uncommitted work.

# Light mode

Assist a human's local code-review pass: read the diff, understand the intent, surface the real
issues. Single-pass and lightweight. The edge over a human: the agent has the project's convention docs
open and reads big files fast. Output is local text only.

## Enrich from the PR

When a PR link or PR was found, use `gh` / `tea` per step 2:

- Use the title and description to understand intent.
- Follow linked issues and PRs: a linked issue's description is part of the intent, and a linked PR may
  have superseded or already fixed it.
- Treat claims in the description and comments ("fixed in the latest push", "this breaks X") as
  hypotheses until the diff or code confirms them.
- Read existing human comments only lightly: to avoid duplicating feedback already raised, and to spot
  claims to verify.
- Ignore bot and CI comments.

## Review lenses

Lenses a human applies, not a checklist to fill: report only what you find; a lens that finds nothing
produces no output.

- **Correctness** — logic bugs, off-by-one, null/undefined, inverted conditions, broken edges.
- **Consistency** — matches the surrounding patterns and naming.
- **Duplication and bad practices** — relevant repeated logic that should reuse something, and general
  bad practice. Relevant, not "these two lines look vaguely similar".
- **Intent mismatch** — does the diff actually do what the title and description claim; anything
  missing, and a title that oversells or hides a behaviour change.
- **Still needed** — the target may have gained the same fix since the branch forked; a change that no
  longer applies is itself a finding.
- **Realistic risk** — security or performance footguns that genuinely apply here, not an audit.
- **Leftovers** — debug prints, commented-out code, stray TODOs, accidentally committed files.

Before reviewing, load the project's own convention docs (CLAUDE.md/AGENTS.md and any relevant
codestyle/contributing docs), then run them as a checklist, not as background reading, against every
changed file and the submission itself (title, description, linked issues). A clear violation is a
first-class, citable comment and the skill's edge over a human, easiest to miss in new test files
(test-structure conventions) and on new class members (visibility and naming).

## Grounded, not speculative

The core rule. A comment may exist only when it points to concrete evidence of one of:

1. **The code is demonstrably wrong** — you can name the actual failure (this input throws, this
   condition is inverted, this loses the value).
2. **It breaks a documented project rule** — you can cite the convention (a doc, or an established
   pattern visible in the surrounding code).
3. **It is a concrete, behavior-preserving simplification** — needless indirection or duplication you
   can collapse with certainty, naming the exact redundancy and the smaller form. (E.g. a non-exported
   const in the class's own file that only aliases one class field is collapsible, or the same
   expression repeated across a template, collapsed into one named derivation; an exported or
   separate-file const is fine, it may be reused elsewhere.)

If you cannot name the evidence — the exact bug, rule, or redundancy — do not comment. Hedge phrases
that signal a guess with no evidence ("there might be", "this could potentially", "consider whether")
are a smell and a classic AI tell: with real evidence, state it plainly; without it, stay silent. (This
bans raising findings you can't back — not phrasing a well-grounded **Suggested comment** to the author
as a polite question; see Output.)

One exception: a genuine clarifying question to the author — rare, only when the diff is truly
ambiguous about intent or correctness and the answer changes whether it is right. Never a routine
"could you clarify?", and never one the PR's stated purpose already answers: a change the title, ticket,
or description explicitly calls for is intended by definition, so don't ask whether it was meant or
whether its prerequisites are done.

**Realism gate:** judge every concern in this code's actual context. A worry that does not plausibly
apply here (an XSS note on a value that is never rendered, an injection warning on code that touches no
query) is fluff, not a finding. Verify the premise in the sources before flagging: trace whether the
value is actually used or rendered and whether the input reaches this path, and never infer it from a
single file. When a quick trace would settle whether the finding holds, run it first.

Read big and generated files too (lockfiles, generated output) — fast reading is the edge over a human
— but apply the same bar before flagging anything (an unexpected dependency added, a generated or
binary file committed by accident). Otherwise skip them silently.

**Zero comments is a valid and common outcome.** Finding few or none is success, not failure. Never pad
to look thorough. No praise, no restating what the code does, no test-coverage lectures, nothing on
lines the PR did not touch.

## Output

Local text only; write no file unless the user later asks to save it.

- Lead with the mode line from step 3, then one short sentence recapping what the PR does, to show the
  change was understood.
- Then the comment list, or a one-line `Looks good, no comments.`
- Say plainly what you verified and what you could not (e.g. behaviour only testable at runtime).
- Each item: a `###` heading holding its sequential finding number and the clickable `path:line`, the
  explanation beneath it, then the optional suggested comment. Put a full-width heavy rule (a row of ~40
  `━`) above each finding and one more after the last, so the list is bracketed top and bottom and the
  eye can jump between comments. For example:

  ````
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ### 1 · `path/to/file.ext:42`

  Brief explanation in a sentence or two.

  Suggested comment:

  ```
  short line to paste, in a real reviewer's voice
  ```

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ### 2 · `path/to/other.ext:88`

  Brief explanation, suggested comment, …

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ````

  The explanation is your note to the user and can be direct. Add **Suggested comment** only when it
  adds something beyond the explanation (nuance, or softer phrasing); if it would just restate the
  explanation, give one or the other, never both near-identical. When the fix is itself a snippet — most
  often an explanatory code comment — the suggested comment can be that snippet, ready to paste, rather
  than prose asking the author to write it. Give each **Suggested comment** as a fenced block holding
  exactly what gets pasted, never a blockquote (`>` prefixes travel with the copy); when the comment
  holds a fence, make the outer one longer, never indent or escape the inner fence. Before writing any
  **Suggested comment**, actually invoke **/use-conversational-language** and follow it — reciting its
  rules from memory does not count. That brevity and softness is tone, not hedging: it never lowers the
  evidence bar from *Grounded, not speculative* — stay grounded in *what* to raise, human and brief in
  *how* you word it.
- **Order mirrors the diff** so the user can read the PR in one window and copy-paste straight down in
  another: files in the diff's own order, ascending line number within a file, grouped by file when a
  file has several comments. This order is absolute: never reorder by a finding's perceived importance
  or severity. No severity labels, no categories. Flat and scannable.

# Full and pedantic mode

You will review the change using the pr-review-toolkit and automatically save the results. In
**pedantic** mode, apply the deltas in F5 and F5b; everything else is identical.

## F1. Resolve the active worktree root

Store reviews in the **current** git worktree so each linked worktree keeps its own `pr_reviews/` history
separate from the main checkout. Resolve the active worktree root:

```bash
git rev-parse --show-toplevel
```

Record this path as `WORKTREE_ROOT` for use in F4 and F12. If the command fails or returns an empty
string, fall back to the current working directory.

Use absolute paths under `WORKTREE_ROOT` (e.g., `ls WORKTREE_ROOT/pr_reviews/`).

## F2. Detect a related Linear issue

If a Linear ticket is associated with the work, capture it so F5 can evaluate whether the PR actually
resolves it. Skip this step silently for WIP reviews that have no PR (no body/title to mine), but still
check the branch name and recent commit messages.

Search these sources in order for a Linear key matching the regex `[A-Z]{2,10}-\d+`:

1. The branch name (e.g., `SCR-123-fix-thing` → `SCR-123`).
2. The PR title (for PR reviews).
3. The PR body — including `Closes`/`Fixes`/`Resolves` lines, the "Magic Words" section, and any Linear
   URL like `https://linear.app/<workspace>/issue/SCR-123/...`.
4. Recent commit messages on the branch: `git log -n 20 --pretty=%B` (only relevant if nothing was found
   above).

Record the **first** key found as `LINEAR_KEY`. If multiple distinct keys appear, prefer the one from the
branch name, then the PR title, then the PR body, then commit messages. If no key is found, record
`LINEAR_KEY` as empty and skip F3.

## F3. Fetch the Linear issue (when a key was found)

If `LINEAR_KEY` is set, attempt to fetch the issue's details so the review can compare the PR against the
ticket's stated requirements.

- **Preferred path — `linear` CLI:** if `linear` is on PATH, fetch the issue with it (e.g.
  `linear issue view "$LINEAR_KEY"`). Do not guess flags: `linear issue --help` /
  `linear issue view --help`. Do not use Linear MCP.
- **Fallback — none:** if `linear` is missing or the fetch fails, do **not** invent ticket details.
  Record that the ticket reference exists but its contents could not be retrieved, and proceed.

When a fetch succeeds, capture:

- Issue identifier and title
- Issue URL
- Current status / state (e.g., `In Progress`, `In Review`, `Done`)
- Description and any acceptance criteria (often a bulleted list inside the description)
- Labels relevant to scope (e.g., `bug`, `feature`, `chore`)

Store this as `LINEAR_CONTEXT` for use in F5 and F9.

## F4. Check for previous reviews

Look for existing review files to determine if this is a versioned re-review:

- If `WORKTREE_ROOT/pr_reviews/` exists (check with `ls WORKTREE_ROOT/pr_reviews/` using the absolute
  path), look there. Otherwise, create it at `WORKTREE_ROOT/pr_reviews/`.
- For PR reviews: look for files matching `review_{PR_NUMBER}*.md` (e.g., `review_123.md`,
  `review_123_v2.md`)
- For WIP reviews: look for files matching `review_{SHORT_HASH}*.md`
- If previous reviews exist:
  - Read the **latest** review file (highest version number, or the unversioned file if only one exists)
  - Extract all issues with their statuses (OPEN, FIXED, DISMISSED)
  - Note any **DISMISSED** issues — these must NOT be re-raised in the new review
  - Determine the new version number (previous max version + 1)
  - Record the previous review's date for the header

## F5. Run the PR review

Invoke the pr-review-toolkit to perform the review as requested by the user. Use
`/pr-review-toolkit:review-pr` with any specific analyzers they mention (e.g., comment-analyzer,
security-analyzer).

### Calibrate severity (full only; skip in pedantic)

Exhaustive reviews trend toward pedantry more than usefulness. We are a working engineering team with
legacy codebases that don't operate at intense scale — ground every finding in that reality:

- Resilience against infrastructure errors matters, but findings should target plausible real-world
  failure modes, not gold-plate code against every conceivable edge case.
- Test coverage matters, but findings should be grounded in catching real issues, not preventing every
  hypothetical future issue an author might imagine.
- A finding earns **Critical** or **Important** only if you can name a concrete, plausible way it would
  actually bite someone in this codebase — not a theoretical worst case.

**Forward this framing to sub-agents — they won't see it otherwise.** Task-spawned sub-agents
(`comment-analyzer`, `silent-failure-hunter`, `pr-test-analyzer`, `type-design-analyzer`,
`code-reviewer`) do not inherit this conversation; they only see the prompt they're given. When the
toolkit launches each one, include the calibration guidance above — and the `silent-failure-hunter` note
below, when applicable — directly in that sub-agent's task prompt.

**`silent-failure-hunter` needs an explicit override.** Its own instructions claim "zero tolerance" for
silent failures and tell it to "call out every instance... no matter how minor" — language strong enough
to override generic pragmatism framing on its own. When invoking it, explicitly instruct it to only
surface **Critical** for silent failures with a plausible production trigger, and to downgrade
broad-catch or missing-context nitpicks that don't hide a real class of error to **Suggestion** (or omit
them).

### Pedantic delta

Do not forward the calibration framing or the `silent-failure-hunter` override: let the sub-agents run
with their own instructions. Tell them to report every finding they can ground in the diff, minor ones
included, each at the severity they judge. Nothing is dropped for being unlikely or small, but a
finding still needs a concrete location and a stated reason; no speculation.

### Scope and context

**Stack-aware scope:** when `STACK_BASE` is set, the PR under review is only the diff
`origin/<STACK_BASE>...HEAD`. Tell the toolkit and forward to every sub-agent that this is the diff to
review (not `main`/default branch), and that lower layers' changes are out of scope — no findings on
lines the PR did not change relative to its base. Also forward the parent and child PR titles so agents
don't flag work that belongs to a sibling layer. A thing that looks missing may land in a child PR:
before raising it, check the child PRs' titles and descriptions (`gh pr view <N> --json title,body`),
and when a child clearly covers it, drop the finding or mention the dependency instead of raising it.

**Worktree note:** The current working directory is the project root for the branch being reviewed.
Agents spawned by the toolkit should explore code here — do NOT navigate to other worktrees or parent
directories to find source files. `WORKTREE_ROOT` is only used for reading/writing review files in F4
and F12.

**Linear-aware analysis:** if `LINEAR_CONTEXT` was captured in F3, treat the Linear ticket — not the PR
description — as the source of truth for _what was supposed to be done_. After the toolkit finishes:

- Compare the ticket's acceptance criteria (or, if none are explicit, the ticket description's intent)
  against the actual diff.
- For each acceptance criterion or stated requirement, classify it as **met**, **partially met**,
  **not met**, or **out of scope for this PR** (e.g., explicitly deferred). Cite the file/line evidence
  for "met" verdicts when practical.
- Treat any **not met** or **partially met** criterion as a finding in the regular sections (typically
  `Important` for missing required behavior, `Suggestion` for nice-to-have polish that the ticket called
  out). Use the issue body to quote the ticket's wording so the gap is traceable.
- In a stack, a ticket may be split across layers. Criteria a child PR delivers are **out of scope for
  this PR** (cite the child PR), not **not met**; criteria a parent PR already delivered are **met** by
  the stack — say so.
- Flag **scope creep**: substantial changes in the diff that have no basis in the ticket (refactors,
  unrelated cleanups, feature additions). Surface these as `Suggestion` findings unless they introduce
  real risk, in which case escalate.
- If `LINEAR_KEY` was found but `LINEAR_CONTEXT` could not be fetched (`linear` missing or the fetch
  failed), do not fabricate ticket contents. Note the limitation in F9's Description block and skip the
  criterion-level analysis.

## F5b. Triage findings for realism (full only; skip in pedantic)

Once the toolkit (and any Linear-aware analysis above) has produced findings, review them yourself as a
backstop before reformatting in F6 — sub-agents may still over-flag despite the calibration above:

- For each finding, ask: would a working engineer on this team actually act on this, or is it
  theoretical completeness?
- Downgrade findings resting on unlikely edge cases (traffic patterns, scale, or failure modes this
  codebase doesn't actually face) from Critical/Important to Suggestion, or drop them entirely if they
  add no real value.
- Do not downgrade findings that are correct and cheap to fix just because they're minor — the goal is
  realism, not silence on legitimate issues.
- Leave findings from the Linear-aware analysis alone unless they specifically suffer from the same
  over-flagging pattern.

## F6. Reformat with sequential numbering

After receiving the review output, post-process it before saving. Assign each issue a sequential global
index starting at 1, incrementing continuously across ALL severity categories. Do not restart numbering
within each category.

Example with 3 critical, 1 important, 1 suggestion:

- Critical: `[#1]`, `[#2]`, `[#3]`
- Important: `[#4]`
- Suggestion: `[#5]`

Replace each bullet point's prefix with its `[#N]` index. This numbering is mandatory — never save a
review without it.

## F7. Add per-issue metadata

Each issue MUST follow this structured format:

````markdown
## [#1] **Some issue title**

**Introduced:** v1
**Severity:** Critical
**Status:** OPEN
**Comment On:**

- `file.ts:42-55`

**Files:**

- `file.ts:42-55`
- `other.ts:128`

**Details:**

Body of the finding — explanation of the bug, evidence, references to sibling code, etc.

Suggested fix - optional remediation guidance.

```js
// optional code block illustrating the fix
```

**Suggested Comment:**

```
Can we reuse `existingHelper` here instead of the new copy?
```

---
````

Formatting rules:

- The title line stands alone (no inline file path, no inline metadata).
- Each metadata field (`Introduced:`, `Status:`, `Files:`) is on its own line. Lines that have a sibling
  field directly below them MUST end with two trailing spaces — this is the markdown line-break syntax
  that prevents adjacent fields from collapsing onto a single rendered line. (`Files:` itself does not
  need trailing spaces because the bulleted list that follows already forces a break.)
- `Comment On:` is the file or file and line number that makes the most logical sense to pin to for
  leaving a PR review comment for the author.
- `Files:` is always a bulleted list, even when there is only one file. This keeps single-file and
  multi-file issues visually consistent and makes adding files trivial.
- `Status:` values are UPPERCASE: `OPEN`, `DISMISSED`, `FIXED`.
- `**Details:**` introduces the body of the finding; leave a blank line after it before the prose.
- `Suggested Fix -` is optional — include it when there is concrete remediation guidance, otherwise
  omit.
- `**Suggested Comment:**` is the review comment to paste at the `Comment On:` location, written in a
  real reviewer's voice for the PR author. Before writing any Suggested Comment, actually invoke
  **/use-conversational-language** (Developer conversations, reviewer comments) and follow it —
  reciting its rules from memory does not count. Give it as a fenced block holding exactly what gets
  pasted, never a blockquote (`>` prefixes travel with the copy); when the comment itself holds a fence,
  make the outer one longer, never indent or escape the inner fence. Wrap identifiers in backticks. The
  comment is the ask, not a restatement of `Details:` — the diagnosis and evidence stay in the body;
  brevity and softness are tone, never a lower evidence bar. Include it for every `OPEN` issue; omit it
  for `DISMISSED` and `FIXED` entries.

Status rules:

- For first-time reviews (v1): all issues are `Introduced: v1` with `Status: OPEN`.
- For re-reviews (v2+):
  - Issues carried forward from a previous version keep their original `Introduced: vN`.
  - New issues found in this review get `Introduced: v{current}`.
  - All active issues have `Status: OPEN`.
  - **Dismissed** issues from the previous review: carry forward with `Status: DISMISSED` but do NOT
    include them in the main findings sections. Instead, list them in a brief "Dismissed" subsection at
    the end (after Recommended Action) so they are preserved but not re-raised.

## F8. Compare with previous review (v2+ only)

If this is a re-review, compare the current findings against the previous review:

- Issues from the previous review that are no longer found: mark as **FIXED**
- Issues from the previous review that are still present: carry forward as **OPEN** with their original
  `Introduced` version
- **DISMISSED** issues: carry forward silently (do not re-evaluate)
- New issues not in the previous review: mark as **OPEN** with the current version

## F9. Format the header

### For PR reviews:

```markdown
# PR#123 - PR title here

**Branch:** `branch-name`
**Mode:** full
**Stack:** 2 of 4 — base `parent-branch`; parent [#120](url), child [#124](url)
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

Note: each metadata line above ends with two trailing spaces — this is required markdown syntax to force
a line break so each field renders on its own line. Without the trailing spaces, the fields collapse onto
a single line in the rendered output.

Mode field rules:

- `**Mode:**` is `full` or `pedantic`, whichever ran.

Stack field rules:

- Include the `**Stack:**` line only when the stack step found a stack (or a non-default `STACK_BASE`).
  Omit it otherwise. Drop the `N of M` position and the parent/child links you could not determine; for a
  non-stack non-default base, render just ``**Base:** `branch-name` ``.
- "Files changed" counts the diff against `TARGET`, not the default branch.

Linear field rules:

- Include the `**Linear:**` header line only when `LINEAR_KEY` was found in F2. Omit the line entirely
  when no key was found.
- When `LINEAR_KEY` was found but `LINEAR_CONTEXT` could not be fetched, render the line as
  `**Linear:** SCR-123 (details unavailable)` and omit the "Linear ticket coverage" subsection. Replace
  the alignment score line with `**Linear ticket alignment:** n/a (ticket contents unavailable)`.
- Omit the `**Linear ticket alignment:**` line and "Linear ticket coverage" subsection entirely when no
  Linear ticket was detected.

If this is a versioned re-review (v2+), add the review version line:

```markdown
# PR#123 - PR title here

**Branch:** `branch-name`
**Mode:** full
**Stack:** 2 of 4 — base `parent-branch`; parent [#120](url), child [#124](url)
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
**Mode:** full
**Commit:** `abc1234`
**Reviewed:** YYYY-MM-DD
**Files changed:** N (X insertions, Y deletions)

---
```

WIP reviews omit the Description and Description accuracy sections entirely.

Notes:

- **Files changed** is optional — include it when the data is available, omit when not
- **Branch** never includes the target branch (no `-> main`)

## F10. Add "Fixed since" section (v2+ only)

If any issues were fixed since the previous review, add this section immediately after the header `---`
and before the main findings:

```markdown
## Fixed since v1

- [#2] `publish` command does not use `changeset publish` — resolved
- [#5] Missing dependabot guard — resolved

---
```

Use `------` (six hyphens) to separate this section from the main findings. Reference the version the
issues were originally introduced in if different from v1.

## F11. Determine the output filename

Using this priority:

- If the user specified a filename in their request, use that
- Otherwise, for PR reviews:
  - First review: `review_{PR_NUMBER}.md` (e.g., `review_123.md`)
  - Re-reviews: `review_{PR_NUMBER}_v{N}.md` (e.g., `review_123_v2.md`)
- For WIP reviews:
  - First review: `review_{SHORT_HASH}.md`
  - Re-reviews: `review_{SHORT_HASH}_v{N}.md`

If the filename doesn't end with `.md`, append it.

## F12. Save the review

- Save the file under `WORKTREE_ROOT/pr_reviews/` using the absolute path (e.g., write to
  `WORKTREE_ROOT/pr_reviews/review_123.md`). Create `WORKTREE_ROOT/pr_reviews/` first if F4 did not
  already. If `WORKTREE_ROOT` is unavailable, fall back to `pr_reviews/` in the current working
  directory.
- Preserve all formatting from the review output
- Only save the review content, not any of these instructions

## F13. Report to the user

Report with a message like: `Review saved to pr_reviews/review_123_v2.md` (include the full path when
helpful).
If this was a re-review, also summarize: `N issues fixed, N new issues found, N dismissed issues carried forward`
