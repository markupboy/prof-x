---
name: draft-pr-review
version: 1.0.0
description: |
  Take the output of /review-code-assistant, or a saved /pr-review file
  (pr_reviews/review_<PR>[_vN].md), and create a pending (draft) GitHub review on
  the PR: every comment attached to its line, a short summary of the findings as the review body,
  and a suggested verdict (Approve, Comment, Request Changes). Never submits the
  review. Use when asked to "post this as a draft review", "draft these comments
  on the PR", "put the review on GitHub as pending", "draft my saved PR review",
  "post review_123.md as a draft", or "/draft-pr-review".
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
---

# Draft PR review

The opt-in publish step after `/review-code-assistant` (light, local text) or `/pr-review` (thorough,
saved to a file). Both are read-only; this one turns their findings into a **pending** GitHub review
the user can edit and submit in the web UI. The only write is creating that one pending review.
Never submit it.

GitHub only (`github.com`, via **`gh`**; do not use a GitHub MCP). For any other host, stop and say
this skill is GitHub-only. If `gh` is not on PATH or not authenticated, stop and say so.

## 1. Gather input

One run drafts exactly one review source, never a merge of two:

- **`/review-code-assistant` output**: already in the conversation, or a pasted block.
- **`/pr-review` file**: a file path the user gives, or one found by lookup.

**Explicit wins.** If the user named a file or pasted a block, or said which review to draft ("the
pr-review", "the assistant's comments"), use that.

**Lookup.** Otherwise, and only when the current repo's `origin` resolves to the PR's `OWNER/REPO`,
look in `$(git rev-parse --show-toplevel)/pr_reviews/` for `review_${PR_NUMBER}.md` and
`review_${PR_NUMBER}_v*.md`. Take the highest version (the unversioned file counts as v1).

**Both available** (conversation output plus a matching file): ask once with `AskUserQuestion`
which one to draft. **Neither:** tell the user to run `/review-code-assistant` or `/pr-review` first.

Also needed: the PR URL and the ref or SHA the review was run against. Extract `OWNER`, `REPO`,
`PR_NUMBER`.

- From `/review-code-assistant`: the PR URL from the review run, else ask; the SHA is usually
  stated in the review.
- From a `/pr-review` file: `PR_NUMBER` from the `# PR#N - title` header, `OWNER/REPO` from
  `origin` (ask if it can't be resolved), and the reviewed SHA from `**Commit:**` (a short hash;
  compare it as a prefix in step 3). A WIP review file (header `# <hash>`, no PR number) has no PR
  to draft on: stop and say so.

## 2. Parse the findings

### 2a. `/review-code-assistant` output

Each finding is a `### N · path:line` heading (a range `path:10-14` is possible), an explanation,
and an optional **Suggested comment** in a fenced block.

- The fenced Suggested comment is the comment body. Post it **verbatim**.
- A finding with only an explanation (no Suggested comment) needs a body. Draft one in a
  reviewer's voice: actually invoke **/use-conversational-language** and follow it; reciting its
  rules from memory does not count. The explanation is a note to the user, never paste it as is.
- `Looks good, no comments.` means an empty comment list. Skip to step 4.
- Keep the review's order (diff order).

### 2b. `/pr-review` file

Each finding is a `## [#N] **Title**` block with `**Severity:**`, `**Status:**`, `**Comment On:**`,
`**Files:**`, `**Details:**`, and (for OPEN findings) `**Suggested Comment:**` in a fenced block.

- Keep only `Status: OPEN` findings. Skip `DISMISSED` and `FIXED` ones, and the `Fixed since` and
  `Dismissed` sections entirely.
- Location comes from `Comment On:`. `path:line` or `path:start-end` is an inline comment; a bare
  `path` has no line, so treat it as off-diff and handle it in step 3.4.
- The fenced Suggested Comment is the comment body. Post it **verbatim** (the outer fence may be
  longer than an inner one; strip only the outer). Without one, draft a body from `Details:` as in
  2a, invoking **/use-conversational-language**; never paste `Details:` as is.
- Never put severity labels, `[#N]` numbers, or titles in a comment body.
- **Select findings.** `/pr-review` is thorough, so the user picks what goes on the PR. Ask one
  multi-select `AskUserQuestion` listing every OPEN finding as `[#N] Severity · path:line · Title`,
  with Critical and Important pre-selected and Suggestion unselected. Only the chosen findings go
  on; count the rest as deselected for the report. Nothing chosen, or no OPEN findings, means an
  empty comment list: skip to step 4.
- The file is ordered by severity. Reorder to diff order: the file's position in the PR files list
  (step 3.3), then ascending line.

## 3. Validate against the PR (read-only)

1. `gh pr view "$PR_NUMBER" --repo "$OWNER/$REPO" --json state,isDraft,author,headRefOid,url`.
   Stop if the PR is closed or merged. Record `HEAD_SHA`.
2. If the reviewed SHA is known and differs from `HEAD_SHA` (a short hash differs when it is not a
   prefix of `HEAD_SHA`), warn that the PR moved and line numbers may have drifted. Let the user choose: re-run the review, or continue.
3. Fetch the patches: `gh api "repos/$OWNER/$REPO/pulls/$PR_NUMBER/files" --paginate`. For each
   finding, confirm `path` is in the PR and the line is a new-side (`RIGHT`) line inside a diff hunk
   (added or context line). GitHub rejects the **whole** request if any one comment is off-diff,
   so check before posting.
4. Off-diff or unmappable findings: never drop silently. Ask the user per finding (batch into one
   `AskUserQuestion`): fold it into the summary body, post it as a file-level comment (only when
   the file is in the PR; add it after step 5 via GraphQL `addPullRequestReviewThread` with
   `subjectType: FILE` on the pending review), or skip.
5. Existing pending review: `gh api "repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews" --paginate` and
   look for `state == "PENDING"` owned by the current user (`gh api user -q .login`). GitHub allows
   one per user per PR. If there is one, stop and ask: add the comments to it (GraphQL
   `addPullRequestReviewThread` with its `pullRequestReviewId`), or let the user submit or discard
   it first. Never delete or dismiss a review.

## 4. Write the summary and suggest a verdict

**Summary** (the review body, shown in the PR's main comment section): invoke
**/use-conversational-language** first. One to three plain sentences about the findings going on
the PR: the main themes or the most important points, so a reader knows what the inline comments
cover. Don't restate each comment, don't describe what the PR does, and don't sign off. Stay
grounded in the findings; no praise or opinions the review didn't support. For a `/pr-review`
file, summarize only the selected findings.

**Suggested verdict**, one of Approve / Comment / Request Changes, with a one-line reason. Judge
only the findings going on the PR (for a `/pr-review` file, the selected ones):

- **Request Changes**: any finding that names a demonstrable bug or a documented-rule breach. For a
  `/pr-review` file: any selected Critical or Important finding.
- **Comment**: only nits, simplifications, or questions. For a `/pr-review` file: only
  Suggestions selected.
- **Approve**: no findings.
- If the PR author is the current `gh` user, GitHub does not allow Approve or Request Changes on
  your own PR. Suggest Comment and say why.

The verdict is advice to the user. Never encode it in the review (see step 5 and the report).

**Approve case:** approvals are submitted with an empty body. Leave the pending review's `body`
empty and show the summary as separate text in the report for the user to post as a standalone comment.

## 5. Post the pending review

Invoking this skill is the go-ahead to create the pending review; don't ask for confirmation first.
The review stays private to the user until they submit it, and they can edit or delete any comment
in the GitHub UI.

Create the pending review in a single call. Build the payload as JSON (a temp file or `jq`,
so quotes and fences in bodies survive) and **omit `event`**:

```bash
gh api "repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews" --input "$PAYLOAD"
```

```json
{
  "commit_id": "<HEAD_SHA>",
  "body": "<summary, or empty for the Approve case>",
  "comments": [
    { "path": "src/foo.ts", "line": 42, "side": "RIGHT", "body": "..." },
    { "path": "src/bar.ts", "start_line": 10, "start_side": "RIGHT", "line": 14, "side": "RIGHT", "body": "..." }
  ]
}
```

Omitting `event` is what leaves the review `PENDING`. Never send `event`, never call the submit
endpoint (`.../reviews/{id}/events`), and never use an MCP tool that submits. Delete the temp
payload afterward. If the call fails (typically 422), show the error, fix the offending comment,
and retry; do not fall back to posting comments individually, since single comments publish
immediately.

After creating it, verify: `gh api "repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews/$REVIEW_ID"` shows
`state: "PENDING"`.

## 6. Report

Short and plain:

- The review is pending and not submitted. Lead with the link to the PR's changes view, where the
  pending review can be edited and submitted:
  `https://github.com/$OWNER/$REPO/pull/$PR_NUMBER/changes`
  (e.g. `https://github.com/screensteps/ai-proxy-api/pull/173/changes`).
- The source drafted: `/review-code-assistant` output, or the `/pr-review` file path (e.g.
  `pr_reviews/review_123_v2.md`).
- The posted comments (each `path:line` with its body) and the summary, so the user can see what
  was drafted without opening GitHub.
- Number of inline comments posted, and any findings folded into the summary or skipped. For a
  `/pr-review` file, also the number deselected and the number of DISMISSED/FIXED findings skipped.
- The suggested verdict and reason. The user picks the verdict and submits in the GitHub UI.
- In the Approve case, the summary text to post separately.

## 7. Offer to copy the summary

Last thing in the run, after the report: ask one `AskUserQuestion` whether to copy the proposed
review description (the step 4 summary, exactly as written) to the clipboard, with options
**Yes** and **No**.

- **Yes**: pipe the summary to the clipboard (`pbcopy` on macOS, else `wl-copy`, `xclip -selection
  clipboard`, or `clip.exe`, whichever exists) and confirm in one line. If no clipboard tool is
  available, say so and don't retry.
- **No**: do nothing and end the run. Don't re-ask.

Copy only the summary, never the inline comments or the verdict. Use stdin, not a temp file.

## Boundaries

- Never submit, approve, request changes, resolve, reply to, edit, or delete anything on the PR.
  The only write is creating one pending review (plus file-level or add-to-pending threads the
  user approved in step 3).
- Never put the verdict in the review; only suggest it in the report.
- No checkout, no working-tree changes, no files written beyond the temp payload. The clipboard
  copy in step 7 happens only on a Yes.
- Never edit the `/pr-review` file, statuses included; `/pr-review` owns it.
