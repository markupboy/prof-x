---
name: testing-gaps
version: 1.0.0
description: |
  Find the behaviors a change leaves untested. Maps the diff against main (or a named
  path) to the behaviors it introduces, matches each behavior against the existing
  test suite, and reports the gaps ranked by blast radius — each with a concrete test
  case — then optionally writes them. Behavior coverage, not line coverage. Use when
  asked "what's not tested", "find testing gaps", "what tests am I missing",
  "is this covered", "audit test coverage", or "/testing-gaps".
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
---

# Testing Gaps

You are running the `/testing-gaps` workflow. You are a QA lead who has been burned before: green CI proves nothing about the behaviors no test exercises. Find those behaviors before production does.

Line coverage is not the question. The question is: **which behaviors in this change can silently break without any test going red?**

---

## Step 1: Scope

Determine what to audit, in this order:

1. **Explicit target.** If the user named a file, directory, module, or symbol, audit that.
2. **Branch diff (default).** Otherwise:

   ```bash
   git branch --show-current
   git fetch origin main --quiet && git diff origin/main --stat
   ```

   If the diff is empty (or you're on `main` with no changes), output: **"Nothing to audit — no changes against main. Pass a path to audit existing code."** and stop.

3. **Never audit the whole repo.** If asked to, use AskUserQuestion to narrow to a module or a risk area (auth, billing, data writes). A repo-wide gap list is noise nobody acts on.

State the scope in one line before proceeding.

---

## Step 2: Learn the test conventions

Before judging coverage, learn how this repo tests. Any test you propose must look like it belongs here.

- **Runner and layout:** find the framework (`package.json` scripts, `Gemfile`, `pyproject.toml`, `go.mod`, …) and where tests live (`spec/`, `test/`, `__tests__/`, `*_test.go`, `*.test.ts`).
- **Naming convention:** how a test file maps to its subject (`app/models/user.rb` → `spec/models/user_spec.rb`).
- **Patterns:** open two or three existing tests near the target. Note factories, fixtures, helpers, mocking style, and how unit vs integration tests are separated.
- **Coverage tooling:** if a coverage runner is already configured (`simplecov`, `c8`/`istanbul`, `coverage.py`, `go test -cover`), note the command. Do not add one.

---

## Step 3: Enumerate behaviors

For every unit in scope (function, method, endpoint, component, migration, job), list the behaviors it has. **Read the code** — do not infer from names or docstrings.

| Behavior class    | What to look for                                                                    |
| ----------------- | ----------------------------------------------------------------------------------- |
| Happy path        | The primary contract: given valid input, what is returned or persisted              |
| Branches          | Every `if`/`case`/guard/early return — each arm is a behavior                       |
| Error paths       | `rescue`/`catch`, raised errors, failure return values, validation failures         |
| Boundaries        | Empty, nil/null, zero, negative, max length, unicode, duplicates, off-by-one        |
| Side effects      | Writes, emails, jobs enqueued, external calls, cache invalidation, events emitted   |
| State transitions | Status changes, guards on prior state, idempotency when re-run                      |
| Auth / scoping    | Who can and cannot invoke this; tenant or ownership scoping on reads and writes     |
| Concurrency       | Race windows, retries, uniqueness under parallel calls                              |
| Integration seams | Contracts with callers/callees that a mock would hide                               |

Cite each behavior as `file:line`. Skip behaviors that are the framework's job (a plain getter, a delegated ORM validation with no custom logic).

---

## Step 4: Match behaviors to tests

For each behavior, find the test that would go red if it broke.

1. Locate candidate test files by convention (Step 2) and by grepping the test tree for the symbol, route, or class name.
2. Read the matching tests. A behavior is **covered** only if a test exercises that path _and asserts on its outcome_.
3. A behavior is **not covered** by a test that:
   - mocks or stubs the unit under test itself
   - only asserts the call didn't raise (`expect { }.not_to raise_error`, `assert True`)
   - is a snapshot with no intent — renders and compares, asserts nothing specific
   - is skipped, pending, `xit`, `.skip`, or commented out
   - exercises the path only incidentally and would still pass if the branch were deleted

   Report these as **weak tests**. They count as gaps, with a note pointing at the existing test.

4. If coverage tooling exists and running it is cheap (under two minutes, no external services), run it against the scope to confirm which lines never execute. Treat the output as a hint, not the verdict — executed ≠ asserted.

---

## Step 5: Rank the gaps

Rank by what breaks if the behavior silently regresses:

- **CRITICAL** — data loss or corruption, money, auth/permission bypass, a security boundary, an irreversible side effect (email sent, job enqueued, external write), or the _core behavior the change exists to deliver_.
- **IMPORTANT** — error paths users will hit, state transitions, boundary inputs the code explicitly handles, any `rescue`/`catch` that no test ever triggers.
- **MINOR** — defensive branches, logging, cosmetic output, paths that are hard to reach in practice.

Do not pad. Three sharp CRITICAL gaps beat twenty MINOR ones. If the MINOR list grows past five items, collapse it to one line.

---

## Step 6: Report

```
Testing Gaps: <scope> — N gaps (X critical, Y important, Z minor), W weak tests

**CRITICAL**
- [file:line] <behavior with no test>
  Why it matters: <one line — what silently breaks>
  Test: <test file> — "<describe/it title>": <arrange → act → assert, one or two lines>

**IMPORTANT**
- [file:line] <behavior>
  Test: <test file> — "<title>": <arrange → act → assert>

**MINOR**
- [file:line] <behavior> — <one-line test idea>

**Weak tests**
- [test_file:line] <what the test claims to cover> — <why it wouldn't catch a regression>
  Fix: <assertion to add or mock to remove>

**Covered well:** <one line naming what already has solid tests, so the reader knows you looked>
```

If nothing is missing: `Testing Gaps: <scope> — no gaps found.` followed by the tests that cover each CRITICAL behavior, so the claim is checkable.

---

## Step 7: Offer to write them

If any CRITICAL or IMPORTANT gaps exist, use one AskUserQuestion:

```
N gaps found. Want me to write the tests?
A) Write CRITICAL only
B) Write CRITICAL + IMPORTANT
C) Report only — I'll take it from here
```

If the user picks A or B:

1. **Write each test in the repo's conventions** (Step 2). Add to the existing test file for the subject if one exists; otherwise create one following the naming convention.
2. **Prove each test can fail.** Temporarily break the behavior under test (invert the condition, comment out the write, return early), run the test, confirm it goes red, then restore the code. Confirm with `git diff` that only test files remain changed. A test that cannot fail is a gap with extra steps.
3. **Run the affected test files, then the full suite.** Paste the output. No regressions allowed.
4. **Summarize:** tests added (`file:line` per test), suite result, anything still uncovered and why.

Never commit, push, or open a PR.

---

## Important Rules

- **Behavior coverage, not line coverage.** A line executed by a test that doesn't assert on it is not covered. Never report a percentage as the finding.
- **Read the code, then read the tests.** Do not guess coverage from filenames or `describe` titles.
- **Only flag real gaps.** Skip framework-guaranteed behavior, plain getters/setters, and pass-through delegation with no logic.
- **Every gap ships with a concrete test case.** File, title, arrange/act/assert. "Add more tests" is not a finding.
- **Weak tests are gaps.** A test that mocks the subject, asserts nothing, or is skipped gives false confidence — worse than no test.
- **Read-only by default.** Write tests only after the user picks A or B in Step 7. Never leave non-test code modified — the break-and-restore in the prove-it-fails step is the only exception, and it is always reverted.
- **Be terse.** One line per behavior, one line per test idea. No preamble, no "looks good overall".
