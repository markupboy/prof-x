# Pre-Landing Review Checklist

## Instructions

Review the `git diff origin/main` output for the issues listed below. Be specific — cite `file:line` and suggest fixes. Skip anything that's fine. Only flag real problems.

The checklist has a **language-agnostic core** plus **stack-specific layers** (Ruby/Rails, TypeScript/Node). Apply the core to every diff. Apply a stack layer only when the diff touches that stack — detect from the files changed (`*.rb`/`Gemfile` → Rails; `*.ts`/`*.tsx`/`package.json` → TS/Node). Ignore layers that don't apply.

**Two-pass review:**

- **Pass 1 (CRITICAL):** Run the CRITICAL core items plus the CRITICAL items of any applicable stack layer first. These can block `/ship`.
- **Pass 2 (INFORMATIONAL):** Run all remaining categories. These are included in the PR body but do not block.

**Output format:**

```
Pre-Landing Review: N issues (X critical, Y informational)

**CRITICAL** (blocking /ship):
- [file:line] Problem description
  Fix: suggested fix

**Issues** (non-blocking):
- [file:line] Problem description
  Fix: suggested fix
```

If no issues found: `Pre-Landing Review: No issues found.`

Be terse. For each issue: one line describing the problem, one line with the fix. No preamble, no summaries, no "looks good overall."

---

## Pass 1 — CRITICAL

### Core (any stack)

- **SQL injection:** untrusted data concatenated or interpolated into a query string (even after numeric coercion like int/float casts) — use parameterized queries or a query builder, never string-built SQL.
- **TOCTOU races:** check-then-act that should be a single atomic operation — conditional `UPDATE ... WHERE`, compare-and-swap, or a DB constraint instead of "read, decide in app code, write."
- **Read-check-write without a uniqueness guard:** "look it up, create if missing" without a unique constraint (or retry-on-duplicate) — concurrent callers create duplicates.
- **Non-atomic status transitions:** updating state without guarding on the prior state (`WHERE status = <old>`), so concurrent updates skip or double-apply a transition.
- **Output / XSS trust boundary:** user-controlled data rendered without escaping, or explicitly marked safe/raw — verify every "render as HTML" or "mark safe" path on untrusted input.
- **LLM output trust boundary:** LLM-generated values (emails, URLs, names, IDs) persisted or passed to side-effecting calls without format validation; structured tool output (arrays, objects) consumed without type/shape checks before a write.

### Ruby/Rails

- String interpolation in SQL — use `sanitize_sql_array` or Arel (even when values are `.to_i`/`.to_f`).
- `update_column`/`update_columns` bypassing validations on fields that have or should have constraints.
- N+1 queries: `.includes()` missing for associations used in loops/views (especially avatar, attachments).
- `find_or_create_by` on columns without a unique DB index, or `where(hash:).first` then `save!` without `rescue ActiveRecord::RecordNotUnique; retry` — concurrent calls create duplicates.
- `html_safe`, `raw()`, or interpolation into `html_safe` output on user-controlled data (XSS).

### TypeScript/Node

- Raw query interpolation in an ORM/driver — Prisma `$queryRawUnsafe` or misused `$queryRaw` templates, Drizzle `sql.raw`, Knex/`pg` `.raw` with interpolated values — use parameter binding.
- DOM XSS: `dangerouslySetInnerHTML`, `el.innerHTML =`, or `v-html` on user data without sanitization.
- LLM / structured output (`JSON.parse` of model output or tool-call args) consumed without schema validation (zod/valibot) before a DB write or side effect.

---

## Pass 2 — INFORMATIONAL

### Core (any stack)

#### Conditional Side Effects

- Code paths that branch on a condition but forget to apply a side effect on one branch. Example: item promoted to verified but URL only attached when a secondary condition is true — the other branch promotes without the URL, creating an inconsistent record.
- Log messages that claim an action happened when it was conditionally skipped. The log should reflect what actually occurred.

#### Magic Numbers & String Coupling

- Bare numeric literals used in multiple files — should be named constants documented together.
- Error message strings used as query filters / matched on elsewhere (grep for the string — is anything keying off it?).

#### Dead Code & Consistency

- Variables assigned but never read.
- Version mismatch between PR title and VERSION/CHANGELOG files.
- CHANGELOG entries that describe changes inaccurately (e.g., "changed from X to Y" when X never existed).
- Comments/docstrings/ASCII diagrams that describe old behavior after the code changed.

#### LLM Prompt Issues

- 0-indexed lists in prompts (LLMs reliably return 1-indexed).
- Prompt text listing available tools/capabilities that don't match what's actually wired up in the tools array.
- Word/token limits stated in multiple places that could drift.

#### Test Gaps

- Negative-path tests that assert type/status but not the side effects (URL attached? field populated? callback fired?).
- Assertions on string content without checking format (e.g., asserting title present but not URL format).
- Missing "this path must NOT call the external service" assertion when a code path should explicitly skip a side effect.
- Security enforcement features (blocking, rate limiting, auth) without integration tests verifying the enforcement path works end-to-end.

#### Crypto & Entropy

- Truncation of data instead of hashing (last N chars instead of SHA-256) — less entropy, easier collisions.
- Non-CSPRNG randomness for security-sensitive values — use a cryptographically secure RNG (`SecureRandom`, `crypto.randomBytes`), not `rand()`/`Math.random()`.
- Non-constant-time comparisons (`==`) on secrets or tokens — vulnerable to timing attacks.

#### Time Window Safety

- Date-key lookups that assume "today" covers 24h — a report at 8am only sees midnight→8am under today's key.
- Mismatched time windows between related features — one uses hourly buckets, another uses daily keys for the same data.

#### Type Coercion at Boundaries

- Values crossing language→JSON→JS boundaries where the type could change (numeric vs string) — hash/digest inputs must normalize types first.
- Hash/digest inputs not coerced to a stable representation before serialization — `{ cores: 8 }` vs `{ cores: "8" }` produce different hashes.

### Ruby/Rails

- Inline `<style>` blocks in partials (re-parsed every render).
- O(n\*m) lookups in views (`Array#find` in a loop instead of an `index_by` hash).
- Ruby-side `.select{}` filtering on DB results that could be a `WHERE` clause (unless intentionally avoiding leading-wildcard `LIKE`).
- `rescue StandardError` or bare `rescue` swallowing specific failures — name the exceptions and handle them.

### TypeScript/Node

- Floating promises / unawaited async (missing `await`, unhandled rejection); `Promise.all` where one rejection silently drops the rest when that isn't intended.
- npm/pnpm supply-chain: newly added `postinstall` scripts, unpinned or lockfile-drifted deps, typosquat-looking package names.
- `any` or unchecked type casts at I/O boundaries that hide shape mismatches from the type checker.

---

## Gate Classification

```
CRITICAL (blocks /ship):                INFORMATIONAL (in PR body):
Core:                                   Core:
├─ SQL injection                        ├─ Conditional Side Effects
├─ TOCTOU races                         ├─ Magic Numbers & String Coupling
├─ Read-check-write uniqueness          ├─ Dead Code & Consistency
├─ Non-atomic status transitions        ├─ LLM Prompt Issues
├─ Output / XSS trust boundary          ├─ Test Gaps
└─ LLM Output Trust Boundary            ├─ Crypto & Entropy
                                        ├─ Time Window Safety
Ruby/Rails:  SQL interp, update_column, └─ Type Coercion at Boundaries
  N+1, find_or_create_by, html_safe
                                        Ruby/Rails: inline <style>, O(n*m)
TypeScript/Node:  ORM raw interp,         views, .select{} vs WHERE, bare rescue
  DOM XSS, unvalidated structured/LLM
  output                                TypeScript/Node: floating promises,
                                          supply-chain, unchecked casts
```

---

## Suppressions — DO NOT flag these

- "X is redundant with Y" when the redundancy is harmless and aids readability (e.g., a presence check redundant with a length check).
- "Add a comment explaining why this threshold/constant was chosen" — thresholds change during tuning, comments rot.
- "This assertion could be tighter" when the assertion already covers the behavior.
- Suggesting consistency-only changes (wrapping a value in a conditional to match how another constant is guarded).
- "Regex doesn't handle edge case X" when the input is constrained and X never occurs in practice.
- "Test exercises multiple guards simultaneously" — that's fine, tests don't need to isolate every guard.
- Eval/threshold changes (max_actionable, min scores) — these are tuned empirically and change constantly.
- Harmless no-ops (e.g., a filter on an element that's never in the collection).
- ANYTHING already addressed in the diff you're reviewing — read the FULL diff before commenting.
