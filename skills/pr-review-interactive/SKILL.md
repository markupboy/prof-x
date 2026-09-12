---
name: pr-review-interactive
version: 1.0.0
disable-model-invocation: true
description: |
  Interactive browser triage of a PR review. Runs the same pr-review-toolkit
  analysis as /pr-review, then serves a local page where every finding is a
  card with its feedback and the exact diff hunk it anchors to. From the page
  the user can ask Claude to verify a finding (false-positive check), reframe
  it, chat about it, dismiss it, and queue findings to submit as a single
  GitHub PR review (or post one now). On "End session" the review is exported
  to pr_reviews/ in the /pr-review markdown format. GitHub only. Slash-only:
  runs when the user types /pr-review-interactive.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
  - Monitor
  - TaskStop
  - AskUserQuestion
---

You will review a GitHub PR (or WIP changes) with the pr-review-toolkit, then serve an interactive local page and **stay in a loop**: the page sends the user's actions to you through a file inbox that a `Monitor` tails, you do the work, and you write the updated state back for the page to render. The user is working in the browser, not the terminal — every confirmation happens in the page.

## Requirements

- **`pr-review-toolkit` (required):** the analysis is `/pr-review-toolkit:review-pr`, exactly as in `/pr-review`. If it is not installed, **STOP** and tell the user to install it.
- **`gh` (required)** and a **GitHub** remote. If `git remote get-url origin` is not `github.com`, stop and point the user at `/pr-review` (which has a Gitea path). Do not improvise a Gitea path here.
- **`python3` (required):** runs `server.py` from this skill directory (stdlib only).
- **Linear MCP (optional):** same handling as `/pr-review` — never invent ticket contents.

Resolve `SKILL_DIR` to the directory containing this SKILL.md (it is a symlink into the prof-x clone; `server.py`, `index.html`, `app.js`, `renderer.js`, `styles.css` live beside it). The sibling skill lives at `SKILL_DIR/../pr-review/SKILL.md`.

## 1. Run the review

Read `SKILL_DIR/../pr-review/SKILL.md` and execute its steps **1, 1b, 1c, 1d, 2, 3, 3b** exactly as written — context detection, `WORKTREE_ROOT`, Linear key detection and fetch, previous-review lookup, the toolkit run with the severity calibration forwarded to every sub-agent, Linear-aware analysis, and the realism triage. Deltas:

- Step 1: GitHub path only (you already stopped on non-GitHub remotes). Also capture the PR metadata you will need for the page and for posting:
  ```bash
  gh pr view "$PR_NUMBER" --json number,title,body,url,headRefName,headRefOid,baseRefName,additions,deletions,changedFiles
  ```
  and `OWNER`/`REPO` parsed from the remote URL. For WIP reviews (no PR) record `isWip: true`; posting is disabled.
- Step 2: previous reviews are `WORKTREE_ROOT/pr_reviews/review_{N}*.md` written by `/pr-review` **or** by an earlier `/pr-review-interactive` export. The rule is the same: DISMISSED findings from the latest previous review are never re-raised; carry them forward with `status: "DISMISSED"`. Findings marked POSTED in a previous export were already sent to the author — carry them forward as `status: "POSTED"` (with their `posted` link) rather than re-raising them as new.
- Do **not** run steps 4–11 of `/pr-review`. Numbering, metadata, and output are handled below.

If `WORKTREE_ROOT/pr_reviews/.interactive/{PR_NUMBER}/review.json` already exists (a previous interactive session on this PR), ask with `AskUserQuestion` before running the toolkit: **Resume** (serve the existing state as-is, skip the analysis) or **Fresh review** (re-run the analysis; existing DISMISSED/POSTED findings still carry forward). Use the short commit hash instead of `{PR_NUMBER}` for WIP reviews.

## 2. Build the session data

Session directory: `SESSION=WORKTREE_ROOT/pr_reviews/.interactive/{PR_NUMBER}/` (create it). Three files live there: `patches.json`, `review.json`, `inbox.jsonl` (the server creates the inbox).

### `patches.json` — one unified patch per changed file, keyed by the **raw path**

```bash
gh api "repos/$OWNER/$REPO/pulls/$PR_NUMBER/files" --paginate \
  --jq '[.[] | {key: .filename, value: (.patch // "")}] | from_entries' > "$SESSION/patches.json"
```

For WIP reviews build it from git instead (one entry per file, patch text without the `diff --git`/`---`/`+++` headers):

```bash
python3 - "$SESSION" <<'PY'
import json, subprocess, sys, re
from pathlib import Path
base = subprocess.check_output(['git', 'merge-base', 'HEAD', 'origin/main'], text=True).strip()
diff = subprocess.check_output(['git', 'diff', base, '--'], text=True)
out, cur, buf = {}, None, []
for line in diff.splitlines():
    m = re.match(r'^diff --git a/(.*?) b/(.*)$', line)
    if m:
        if cur: out[cur] = '\n'.join(buf)
        cur, buf = m.group(2), []
    elif cur and not line.startswith(('---', '+++', 'index ', 'new file', 'deleted file', 'similarity', 'rename ', 'old mode', 'new mode')):
        buf.append(line)
if cur: out[cur] = '\n'.join(buf)
Path(sys.argv[1], 'patches.json').write_text(json.dumps(out))
PY
```

(Adjust `origin/main` to the repo's default branch.)

### `review.json` — the page state

Apply `/pr-review` steps 4–5 mentally: sequential `[#N]` ids across all severities (Critical first, then Important, then Suggestion), `Introduced: vN`, and a `Comment On:` anchor per finding. Then write this JSON with Python (`json.dump` to a temp file, then `os.replace` — never build JSON by string concatenation; details can contain quotes, backticks, and `</script>`):

```json
{
  "version": 1,
  "pr": {"number": 123, "title": "…", "url": "https://github.com/o/r/pull/123", "owner": "o", "repo": "r",
         "headSha": "<full headRefOid>", "headRef": "…", "baseRef": "main",
         "additions": 0, "deletions": 0, "changedFiles": 0, "isWip": false},
  "linear": {"key": "SCR-1", "title": "…", "url": "…", "state": "In Review", "alignment": "8/10"},
  "summary": {"description": "markdown — what the changes actually do",
              "descriptionAccuracy": "7/10",
              "linearCoverage": {"met": [], "partial": [], "notMet": [], "outOfScope": [], "scopeCreep": []}},
  "reviewVersion": 1, "previousReview": null,
  "lastHandledMessageId": 0,
  "ended": false, "exportedTo": null,
  "activity": [{"at": "2026-08-30T10:00:00", "text": "Review ready: 1 critical, 2 important, 1 suggestion", "kind": "ok"}],
  "findings": [{
    "id": 1, "title": "…", "severity": "Critical", "status": "OPEN", "introduced": "v1",
    "anchor": {"path": "src/a.ts", "startLine": 42, "endLine": 55},
    "files": ["src/a.ts:42-55", "src/b.ts:128"],
    "details": "markdown body — explanation, evidence, sibling-code references",
    "suggestedFix": "markdown or null",
    "comment": {"body": ""},
    "queued": false, "posted": null, "verification": null, "thread": [], "history": [], "error": null
  }]
}
```

Rules:

- `linear` is `null` when no key was found. When the key exists but the fetch failed, set `{"key": "SCR-1", "title": null, "url": null, "state": "details unavailable", "alignment": null}` and omit `linearCoverage`.
- `summary` is `null` for WIP reviews. `linearCoverage` entries are short strings; reference findings as `` `[#N]` ``.
- `anchor` comes from the `Comment On:` line: `file.ts:42-55` → 42–55, `file.ts:42` → 42–42. Lines are **new-file (RIGHT side) lines**. Prefer anchoring on a line that is actually in the diff — GitHub rejects inline comments on lines outside the diff, and the page warns when the anchor is not in any hunk. If a finding has no sensible location (e.g. "missing test file"), use `{"path": "<the most relevant changed file>", "startLine": null, "endLine": null}`; posting will use a file-level comment.
- `status` is one of `OPEN`, `DISMISSED`, `FIXED`, `POSTED`. Carried-forward DISMISSED/POSTED findings keep their original `introduced`.
- `comment.body` starts empty; the page derives a default from `details` + `suggestedFix` and the user edits it before posting. Never include `[#N]`, severity, or metadata lines in a comment body.
- For re-reviews (v2+), set `reviewVersion` and `previousReview: {"version": 1, "date": "YYYY-MM-DD", "file": "pr_reviews/review_123.md"}`, and mark findings no longer present as `FIXED` (they render in the page and export under "Fixed since").

## 3. Serve and open

Start the server backgrounded on port 8433; if it exits with status 2 (port busy) retry 8434, 8435, …:

```bash
python3 "$SKILL_DIR/server.py" --session "$SESSION" --port 8433
```

Read the bound port from `$SESSION/port`, then open the page in the user's browser: `open "http://127.0.0.1:$PORT/"`.

Start the inbox monitor — this is what wakes you when the user acts in the page:

```
Monitor({
  command: "tail -n0 -F \"$SESSION/inbox.jsonl\"",
  description: "pr-review-interactive actions for PR #<N>",
  persistent: true
})
```

Then tell the user, in the terminal: the URL, the finding counts by severity, that they can act from the page, and that typing in the terminal also works. **End your turn** — the Monitor will re-invoke you when a message arrives.

## 4. Handle inbox messages

Every inbox line is one JSON message with `id`, `at`, `type`, and usually `finding` (the finding id). Handle messages **in order**. After each one, rewrite `review.json` atomically with:

- the updated finding(s),
- `lastHandledMessageId` set to that message's `id` (the page clears its "working…" overlay when this reaches the id it is waiting on — so write it once per message, not once per batch),
- an `activity` entry (`text` in plain prose; `kind` is `ok`, `err`, or omitted). The page toasts new entries.

Several lines can arrive in one notification. Do not skip any. If you cannot complete a message, still write `lastHandledMessageId` and put the reason in `finding.error` or an `err` activity — never leave the page spinning.

**Terminal input works too.** If the user types here ("dismiss #4", "verify all critical"), treat it like the equivalent messages and write `review.json`; the page picks it up within a second.

### `verify` — `{finding}`

A false-positive check, in the spirit of `/verify-this`: restate the claim in falsifiable form, then test it against the real code — trace the code path, look for guards in callers, tests that pin the behavior, framework guarantees, and whether the diff hunk actually does what the finding says. Cite `file:line` for every claim. Write:

```json
"verification": {"verdict": "CONFIRMED" | "FALSE_POSITIVE" | "UNCERTAIN", "evidence": "markdown with citations", "at": "ISO"}
```

`CONFIRMED` requires a concrete trigger you can name; `FALSE_POSITIVE` requires the specific guard/evidence that defeats the claim; otherwise `UNCERTAIN` with what would settle it. Do **not** change `status` — on `FALSE_POSITIVE` the page offers a one-click Dismiss and the user decides. If the verdict changes the appropriate severity, say so in the evidence rather than editing severity.

### `reframe` — `{finding, instruction}`

Rewrite `title`, `details`, and (if non-empty) `comment.body` per the instruction ("softer", "as a question", "shorter", "more specific", "for a junior author", "lead with the fix", or free text). Push the previous `{title, details, at, reason: "reframe: <instruction>"}` onto `history`. Keep the technical substance and citations; change severity only if the instruction asks for it.

### `ask` — `{finding, question}`

Append `{"role": "user", "text": question}` then `{"role": "claude", "text": answer}` to `thread`. Read the repo as needed; answers cite code. Keep answers short and concrete — this is a chat bubble, not a report.

### `set_status` — `{finding, status, reason?}`

`status` is `OPEN` or `DISMISSED`. Persist it. Dismissing a queued finding also clears `queued`. Record `history` entry `{reason: "dismissed: <reason or 'by user'>"}` for dismissals.

### `set_severity` — `{finding, severity}`

Persist the user's override; add a `history` entry noting the old severity.

### `queue` / `unqueue` — `{finding, body}` / `{finding}`

`queue`: set `queued: true` and `comment.body = body` (the user's edited text). `unqueue`: `queued: false` (keep `comment.body`). No GitHub calls.

### `post_one` — `{finding, body, confirmed: true, allowFileLevel?: true}`

**Requires `confirmed: true`** (the page shows the exact text in a confirm dialog before sending). Post one inline review comment on the PR head commit:

```bash
gh api "repos/$OWNER/$REPO/pulls/$PR_NUMBER/comments" \
  -f body="$BODY" -f commit_id="$HEAD_SHA" -f path="$PATH" -f side=RIGHT -F line="$END_LINE"
```

Add `-F start_line="$START_LINE" -f start_side=RIGHT` when `startLine < endLine`. Pass the body via `--input` (JSON built with Python) rather than `-f` when it contains characters that are awkward in a shell string.

- Success: `finding.posted = {"url": html_url, "id": id, "at": ISO}`, `status: "POSTED"`, `queued: false`, `comment.body = body`, `error: null`.
- Failure (GitHub returns 422 when the line is not part of the diff, or the anchor has no line): write the error message into `finding.error` (include the literal `422` when that's the status so the page can offer the fallback) and leave status unchanged. Retry as a **file-level** comment only when `allowFileLevel: true` is in the message — `-f subject_type=file` without `line`/`side`.

### `submit_review` — `{items: [{finding, body}], reviewBody, event, confirmed: true}`

**Requires `confirmed: true`.** Create one review containing every item as an inline comment. Build the payload with Python and post it with `--input`:

```python
payload = {
  "commit_id": HEAD_SHA, "body": reviewBody, "event": event,   # "COMMENT" or "REQUEST_CHANGES" — never "APPROVE"
  "comments": [
    {"path": a.path, "line": a.endLine, "side": "RIGHT", "body": item.body,
     **({"start_line": a.startLine, "start_side": "RIGHT"} if a.startLine and a.startLine < a.endLine else {})}
    for each item, a = finding.anchor
  ]
}
```

```bash
gh api "repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews" --input payload.json
```

- Success: for every item set `posted = {"url": review.html_url, "reviewId": review.id, "at": ISO}`, `status: "POSTED"`, `queued: false`, `comment.body`. Activity: "Submitted review with N comments".
- Failure: GitHub is atomic — nothing was posted. Surface the error text in an `err` activity and, when the message names a path/line, in that finding's `error`. Leave the queue intact. If an item's anchor has no line, tell the user (activity) to post it individually with the file-level fallback; do not silently drop it.

If `event` is anything other than `COMMENT` or `REQUEST_CHANGES`, refuse and say so in an `err` activity.

### `export` — `{}`

Write the markdown file (section 5) now, without ending. Set `exportedTo` to the path relative to `WORKTREE_ROOT`. Activity: "Exported to pr_reviews/review_123.md".

### `end` — `{}`

Do section 6.

### `note` — `{text}`

Free-form note from the page (reserved; treat like `ask` without a finding: answer in an activity entry).

### Guardrails

- GitHub writes happen **only** for `post_one` and `submit_review` messages carrying `confirmed: true`, with the body text the user confirmed. Never approve, merge, resolve or unresolve threads, edit or delete comments, add reactions or labels, or request reviewers. Everything else is `gh` reads.
- WIP reviews (`isWip: true`) never post — refuse `post_one`/`submit_review` with an `err` activity.
- Never use `AskUserQuestion` while handling an inbox message — the user is in the browser. Put questions in the finding's `thread` or an activity entry instead.
- Keep `review.json` small: no patches in it. Never edit `patches.json` after the session starts.

## 5. Markdown export

Write `WORKTREE_ROOT/pr_reviews/review_{PR_NUMBER}.md` (or `_v{K}.md` for re-reviews; `review_{SHORT_HASH}` for WIP) in exactly the `/pr-review` format — read its steps **5, 7, 8** for the per-issue block, the header (including the Linear lines and "Linear ticket coverage" subsection), and "Fixed since". Map state to the file:

- Findings with `status` `OPEN` → main sections by severity, `**Status:** OPEN`.
- `POSTED` → main sections with `**Status:** POSTED` and an extra metadata line `**Posted:** <url>` directly under `**Status:**` (this is an addition to the `/pr-review` format; `/pr-review` treats unknown statuses as active).
- `DISMISSED` → the "Dismissed" subsection at the end, not the main sections.
- `FIXED` → the "Fixed since vN" section (re-reviews only).
- If `verification` exists, append a `**Verification:** <verdict>` line under the status lines and the evidence at the end of `**Details:**`.
- Use the current `title`/`details`/`severity` (post-reframe/override). Thread and history are not exported.

## 6. End the session

On an `end` message, or when the user says so in the terminal:

1. Export the markdown (section 5) and set `exportedTo`.
2. Write `review.json` one last time with `ended: true` and `lastHandledMessageId` (the page shows "Session ended").
3. `TaskStop` the inbox monitor.
4. Stop the server: `kill "$(cat "$SESSION/server.pid")"`.
5. Report in the terminal: the export path and counts — verified (confirmed / false positive / uncertain), dismissed, posted, still open — plus any queued-but-unsubmitted comments (kept in `review.json`; they were **not** posted).

Leave `SESSION` in place so a later run can offer **Resume**.

## Failure notes

- **Port busy:** `server.py` exits 2; try the next port. Always read `$SESSION/port` rather than assuming 8433.
- **Page shows "Disconnected":** the server died. Restart it with the same `--session` and `--port`; state is on disk.
- **Monitor stopped** (session restart, or "too many events"): re-arm it with the same `tail -n0 -F` command. Then `cat` the inbox and handle any message with `id > lastHandledMessageId` — those arrived while nobody was listening.
- **Anchor not in diff:** the page warns before the user posts. If they post anyway and GitHub 422s, the file-level fallback is offered in the page; do not attempt it unprompted.
- **`gh` auth or rate limit errors:** surface the message in an `err` activity and the finding's `error`; do not retry in a loop.
