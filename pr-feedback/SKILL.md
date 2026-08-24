---
name: pr-feedback
version: 1.0.0
description: |
  Validate a piece of GitHub PR review feedback before acting on it. Takes a
  link to a review thread (or PR comment), checks the reviewer's claim against
  the actual code, and recommends one of PROCEED (address it), CLARIFY (draft
  questions for the author to raise), or PUSH BACK (draft a justification for
  the author to post) — each with evidence. Use when given a link to a PR
  review thread or comment, or when asked to "validate this feedback",
  "address this review comment", "is this reviewer right", "respond to this
  review thread", "handle this PR feedback", or "/pr-feedback".
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - AskUserQuestion
---

You will validate one piece of GitHub PR review feedback and help the author respond to it well. The reviewer is not automatically right; neither is the author. Your job is to find out which, with evidence, before anyone writes code or replies.

## Hard guardrail: never write to GitHub

This skill is **read-only against GitHub**. Under no circumstances may you:

- post a reply, comment, or review to the PR or the thread
- resolve, unresolve, or edit the thread
- add reactions, labels, or any other mutation

Every `gh` invocation must be a read (`gh api` GETs, `gh pr view`, `gh api graphql` queries — never mutations). Clarifying questions and push-back drafts are delivered **only in this session**, for the author to post themselves. This holds even if the user asks you to post — decline and hand them the text instead.

## 1. Parse the link

The user provides a link to the feedback. Two forms are accepted:

- **Inline review thread:** `https://github.com/{owner}/{repo}/pull/{number}#discussion_r{comment_id}` — a comment (possibly with replies) anchored to a diff location.
- **General PR comment:** `https://github.com/{owner}/{repo}/pull/{number}#issuecomment-{comment_id}` — a comment on the PR conversation, not anchored to code.

Extract `OWNER`, `REPO`, `PR_NUMBER`, the comment id, and which form it is. If no link was provided, ask for one. If the link is to a different host (e.g. a Gitea instance), stop and tell the user this skill is GitHub-only.

## 2. Fetch the thread (read-only)

### Inline review thread (`#discussion_r...`)

Fetch the full thread — not just the linked comment — so replies and prior back-and-forth inform the verdict. Prefer GraphQL because it returns the whole thread with resolution state in one query:

```bash
gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            isResolved
            isOutdated
            path
            line
            startLine
            comments(first: 100) {
              nodes {
                databaseId
                author { login }
                body
                createdAt
                diffHunk
              }
            }
          }
        }
      }
    }
  }' -f owner="$OWNER" -f repo="$REPO" -F pr="$PR_NUMBER"
```

Find the thread whose `comments` include a `databaseId` equal to the id from the link. Paginate with `endCursor` if it isn't in the first page. Record:

- `THREAD`: every comment in order (author, body, timestamp)
- `PATH`, `LINE` (and `startLine` for multi-line comments), `diffHunk`
- `isResolved` and `isOutdated`

**REST fallback** (if the GraphQL query fails): fetch the anchor comment with `gh api "repos/$OWNER/$REPO/pulls/comments/$COMMENT_ID"`, then reconstruct the thread from `gh api "repos/$OWNER/$REPO/pulls/$PR_NUMBER/comments" --paginate` by collecting the root comment (the anchor's `in_reply_to_id`, or the anchor itself if it has none) plus every comment whose `in_reply_to_id` points at that root.

### General PR comment (`#issuecomment-...`)

```bash
gh api "repos/$OWNER/$REPO/issues/comments/$COMMENT_ID"
```

Issue comments have no thread structure. If the comment reads like part of an ongoing exchange, fetch the surrounding conversation for context: `gh api "repos/$OWNER/$REPO/issues/$PR_NUMBER/comments" --paginate` and read the comments adjacent in time.

### Early exits

- If the thread is **resolved**, tell the user and confirm they still want it validated before continuing.
- If the linked comment is from the PR author themselves (not a reviewer), point that out and confirm intent.

## 3. Gather context

The feedback can only be judged against the real code. Collect:

1. **PR metadata:** `gh pr view "$PR_NUMBER" --repo "$OWNER/$REPO" --json title,body,state,headRefName,headRefOid` — title, description, state, and head branch/commit.
2. **The code under discussion, as it exists now:**
   - If the local checkout is on the PR's head branch (compare `git rev-parse --abbrev-ref HEAD` / `git rev-parse HEAD` against `headRefName` / `headRefOid`), read the file directly — this also lets you explore surrounding code, callers, and tests properly.
   - Otherwise fetch the file at the PR head: `gh api "repos/$OWNER/$REPO/contents/$PATH?ref=$HEAD_SHA" -q .content | base64 -d`.
3. **The diff hunk** the comment was anchored to (from step 2), so you can see what the reviewer was looking at when they wrote it.
4. **Staleness check:** if `isOutdated` is true, or the code at head no longer matches the diff hunk, the feedback may already be addressed by a later commit. Compare the hunk against the current code and note the difference explicitly.

When working from a local checkout, explore as deeply as needed — callers, tests, sibling implementations, git history of the lines in question (`git log -L`) — to evaluate the claim properly.

## 4. Validate the feedback

Assess the reviewer's claim on its merits. Concretely:

- **Restate the claim.** What is the reviewer actually asserting or asking for? Separate the factual claim ("this leaks a connection") from the preference ("I'd name this differently") — threads often mix both.
- **Test it against the code.** Does the asserted behavior actually occur? Trace the code path. Check whether the concern is guarded elsewhere (a caller validates, a test pins the behavior, the framework guarantees it).
- **Check for staleness.** Was it already addressed by a commit after the comment? Cite the commit if so.
- **Weigh trade-offs the reviewer may not have seen.** Constraints from the ticket, deliberate scope cuts, established patterns in the codebase, performance realities.
- **Steelman both sides.** Do not rubber-stamp the reviewer out of deference, and do not defend the author's code out of loyalty. Every conclusion needs a file/line citation or an observed behavior behind it.

If the feedback contains multiple independent points, evaluate each one — the verdict in step 5 may differ per point.

## 5. Present the verdict

Deliver exactly one recommendation per feedback point, each with written justification grounded in the evidence from step 4:

- **PROCEED** — the feedback is valid and actionable. The reviewer is right (or right enough), and the fix is worth making. Justify with what you verified and sketch the intended change.
- **CLARIFY** — the feedback is ambiguous, rests on unstated assumptions, or could reasonably mean two different changes. Justify by naming the specific ambiguity and what hinges on it.
- **PUSH BACK** — the feedback is factually incorrect, already addressed, or the current approach is defensible on the merits. Justify with the citations that contradict the claim.

Present the verdict summary in the session, then use `AskUserQuestion` to let the user choose the path — recommended option first, labeled "(Recommended)", with the other two verdicts as alternatives. The user may override your recommendation; respect their choice.

For multi-point feedback, present a verdict per point and ask about each (batch the questions in a single `AskUserQuestion` call).

## 6. Act on the chosen path

### PROCEED — address the feedback

- Implement the change **in the local working tree only**. If the local checkout is not on the PR's head branch, stop and tell the user to check it out first — do not edit an unrelated branch.
- Never commit, never push, never post. Leave the changes staged-nothing, uncommitted, for the author to review.
- Run the narrowest relevant validation (the file's tests, a typecheck) when available.
- Summarize what changed and why it satisfies the feedback, and remind the user that committing, pushing, and replying to the thread are theirs to do.

### CLARIFY — draft questions for the author

- Write the clarifying questions **in this session only** — never post them to the thread, even if asked.
- Phrase them for the author to relay to the reviewer: specific, answerable, and neutral in tone. Each question should name the ambiguity and, where useful, the two readings it disambiguates ("Did you mean X or Y? X would imply..., Y would imply...").
- Keep it short — one to three questions. A wall of questions reads as stonewalling.

### PUSH BACK — draft a justification for the author

- Draft a reply **for the author to post themselves** — never post it.
- The draft should be respectful and evidence-first: acknowledge the concern, state the finding, cite the specific file/line or commit that supports it, and leave the door open ("happy to change it if I'm missing something").
- No sarcasm, no appeals to authority, no "as discussed". The author's credibility rides on this text.
- Offer the draft in a fenced block so it is easy to copy.

## 7. Report

End with a compact summary: the verdict(s), what action was taken (files edited, questions drafted, or reply drafted), and what remains for the author to do on GitHub (commit/push, post questions, post the reply, resolve the thread).
