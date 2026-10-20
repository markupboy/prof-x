---
name: squash-description-fix
version: 1.0.0
description: |
  Clean up a GitHub auto-generated squash-merge message. Takes the pasted message as the
  argument, drops entries that only matter inside the PR (suggestion applies, merges,
  review-fix churn), rewrites what's left in plain readable language, and collapses all
  Co-authored-by trailers to the bottom. Text in, text out; never touches Git or GitHub.
  Use when asked to "clean up this squash message", "fix the squash description", "scrub this
  squash commit", "tidy the merge commit message", or "/squash-description-fix".
allowed-tools:
  - Read
---

# Squash description fix

A PR with a lot of back and forth produces a gnarly auto-generated squash message: one `* ` entry per commit, review-suggestion commits, merge commits, and a `Co-authored-by:` line after nearly every entry. Once the PR lands on main, none of that PR-internal history matters. Turn the message into what a future reader of `git log` wants to see.

The squash message is a commit message published under the user's name. Invoke the `use-conversational-language` skill (Baseline and Commit messages sections) before writing any rewritten text.

## Guardrails

- Pure text transform. Never run Git or `gh` commands, never post or edit anything on GitHub. The user pastes the result into the merge box themselves.
- Faithful to the source. Rewording is for readability only; never invent facts, reasons, or scope that the original entries don't state.

## Input

The pasted message is the skill argument. If it's empty, ask the user to paste it and stop.

## Step 1: Parse

- Each line starting with `* ` begins a commit entry. Its first line is the title; the following paragraph(s) are the body.
- `Co-authored-by:` lines inside an entry are collected, not kept in place.
- A `---------` line ends the entries. Everything after it is a trailing trailer block; collect its `Co-authored-by:` lines too.
- No `* ` entries (single commit, or already clean): say so, keep the title and body as they are, and only collapse the co-authors.

## Step 2: Drop PR-internal entries

Drop an entry when it only matters while the PR is open:

- Suggestion applies and bot-style titles: `Update <path>`, `Apply suggestions from code review`, `Apply automatic changes`.
- Pure churn: `Merge branch ...`, `Merge main into ...`, `Merge remote-tracking branch ...`, `Revert ...` of something also added in this PR, `wip`, `fixup!`, `squash!`, `Address review feedback`, `fix lint`, typo-only fixes.
- Entries that describe the review process instead of a change.

A dropped entry still contributes its co-authors (a reviewer who only landed suggestions still gets credit).

Judgment calls: a small fix that is part of the shipped behavior (a follow-up that changes what the feature does or its tests) is not churn, even if the title sounds minor. If unsure, keep the entry and add a one-line note after the output block naming it.

## Step 3: Merge and rewrite

- If a later entry undoes or fully supersedes an earlier one, keep only the net result.
- Keep titles in the imperative, saying what the change does in everyday words. Reword only when needed to read naturally, and drop PR-process narration ("per review", "as discussed", "now also", "follow-up to the previous commit").
- Each body becomes bullets, one per sentence. An entry with no body is just its title.

## Step 4: Collapse co-authors

- Collect every `Co-authored-by:` line from kept entries, dropped entries, and the trailing block.
- De-duplicate by email (fall back to name when there's no email). Keep first-appearance order and the original `Name <email>` form.

## Output

One fenced block, nothing else inside it:

```
<Title>
- <body sentence>

<Title>
- <body sentence>

---------

Co-authored-by: Name <email>
Co-authored-by: Name <email>
```

Omit the `---------` section when there are no co-authors. After the block, add at most a short note: entries kept on a judgment call, or that nothing needed dropping. No other commentary.

## Worked example

Input:

```
* Show a clearer message when a request cannot reach ScreenSteps

Blocked or dropped requests no longer claim the session expired, and only real network failures get that message.

Co-authored-by: Cursor <cursoragent@cursor.com>

* Name the unreachable host in network error messages

Failed fetches are tagged where they happen instead of matched by message text, so unrelated errors keep their own message.

Co-authored-by: Cursor <cursoragent@cursor.com>

* Tag every fetch failure at boot

A single window.fetch wrapper replaces the per-call-site wraps, so uploads, memberAction and the other raw fetches name the unreachable host too.

Co-authored-by: Cursor <cursoragent@cursor.com>

* Update app/utils/errors.js

Co-authored-by: Trevor DeVore <trevor@screensteps.com>

* Update app/utils/errors.js

Co-authored-by: Trevor DeVore <trevor@screensteps.com>

* Keep the Mirage fetch check working with the tagged fetch

The boot-time fetch wrapper no longer counts as a patched fetch, and the network error tests now expect the new copy.

Co-authored-by: Cursor <cursoragent@cursor.com>

---------

Co-authored-by: Cursor <cursoragent@cursor.com>
Co-authored-by: Trevor DeVore <trevor@screensteps.com>
```

Output:

```
Show a clearer message when a request cannot reach ScreenSteps
- Blocked or dropped requests no longer claim the session expired, and only real network failures get that message.

Name the unreachable host in network error messages
- Failed fetches are tagged where they happen instead of matched by message text, so unrelated errors keep their own message.

Tag every fetch failure at boot
- A single window.fetch wrapper replaces the per-call-site wraps, so uploads, memberAction and the other raw fetches name the unreachable host too.

Keep the Mirage fetch check working with the tagged fetch
- The boot-time fetch wrapper no longer counts as a patched fetch, and the network error tests now expect the new copy.

---------

Co-authored-by: Cursor <cursoragent@cursor.com>
Co-authored-by: Trevor DeVore <trevor@screensteps.com>
```
