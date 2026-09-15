# Changelog

## [Unreleased]

### Added

- `/implement` skill: thin orchestrator that runs fetch → review-ticket → refine-ticket
  → create-implementation-plan as isolated subagents (fresh context each hop), pauses
  for plan approval, then launches `/execute-plan`.
- `/execute-plan` skill: implement a `.PLAN.md` in a clean session — plan file only,
  then the project's validation. No commit/PR unless asked.
- `/fetch-ticket` skill: fetch tracker tickets into self-contained `.TICKET.md` files.
  Fetch only — no analysis or planning.
- `/review-ticket` skill: pre-pickup triage of a ticket or set against the codebase,
  saved as `.TICKET-REVIEW.md` with only the high-cost questions worth raising.
- `/refine-ticket` skill: grill a ticket or idea into a verified REQUIREMENTS document
  (the what, not the how).
- `/create-implementation-plan` skill: turn REQUIREMENTS into a structured PLAN.md a
  fresh session can execute.
- `/create-manual-test-instructions` skill: turn a ticket or REQUIREMENTS into a concise
  `.MANUAL-TEST.md` a non-author can follow.
- `/handover` skill: package a finished change as a reviewer-facing PR description /
  handover doc.
- `/self-review` skill: review your own changeset until merge-ready and write a compact
  report proving it.
- `/memory-doctor` skill: drain project agent-memory, relocating each block into a
  user-controlled home or archiving it.
- `/context-checkup` skill: measure what auto-loads into a session's context and
  recommend reversible trims ranked by tokens saved. Slash-only.
- `/fetch-pr-review` skill: capture every comment on a PR URL into a self-contained
  `.PR-REVIEW.md` in the task's planning directory. Fetch only — no triage or replies.
- `/refine-pr-review` skill: triage a fetched PR-REVIEW file with the user, draft
  replies, and write REQUIREMENTS for accepted changes.
- `/review-code-assistant` skill: local read-only review of a branch/PR diff;
  suggest pasteable comments, never post.
- `/use-conversational-language` skill: concise, natural voice for human-facing text
  (conversations, comments, commit messages) without changing content.
- `no-nonsense-comments` always-on rule: durable comments that make sense without session
  context. `setup` registers `rules/` into Claude Code and Cursor alongside skills.
- Four always-on rules: `git-read-only-by-default`, `plans-directory`,
  `self-contained-docs`, and `write-realistic-texts`.

### Removed

- Unused skills: `/investigate`, `/pr-review-canvas`, `/pr-review-interactive`,
  `/retro`, `/verify-this`.

### Changed

- GitHub / Gitea / Linear access goes through CLIs (`gh`, `tea`, `linear`), not forge
  MCPs. `/fetch-ticket`, `/fetch-pr-review`, `/review-code-assistant`, `/pr-review`,
  `/ship`, and `/spec` pick the CLI from the URL or git remote host.
- Skill packages now live under `skills/` (e.g. `skills/review/`) so a sibling
  `rules/` directory can coexist without colliding with skill names.
  `setup` registers from `skills/` and still prunes pre-restructure symlinks
  that pointed at the repo root. Nested-skill path fallbacks in `/review` and
  `/ship` include the new clone path.

## [0.5.1] - 2026-08-30

### Changed

- `/ship` Pre-Landing Review now runs the `/review-bugbot` skill first when it's available;
  if Bugbot reports findings, the user chooses to abort the ship, fix and continue, or ignore.
  Remaining review steps renumbered accordingly.
- `/ship` Step 8 is now "Create or Update PR": if a PR already exists for the branch, the
  create step is skipped and the existing description is revisited instead — outdated
  pre-landing review items are removed, and the body is only rewritten when the PR's core
  functionality has materially changed (not for feedback fixes, test/comment updates, or
  minor structural changes).

## [0.5.0] - 2026-08-30

### Added

- `/pr-review-interactive` skill — the `/pr-review` analysis (steps 1–3b run by reference:
  same toolkit, calibration, and Linear-awareness) served as a local interactive page
  instead of a markdown file. Every finding is a card with its feedback and the exact diff
  hunk it anchors to (anchored lines highlighted; off-diff anchors warned about). From the
  page the user can ask Claude to **verify** a finding (false-positive check with cited
  evidence), **reframe** it, **ask** about it in a per-finding thread, dismiss it, override
  severity, and **queue** findings to submit as one GitHub review — or post a single inline
  comment now — with the exact text confirmed in-page first. The loop is a bundled stdlib
  `server.py` (static app + JSON API over a session dir, bound to `127.0.0.1`, with a
  `Content-Type`/`Origin` guard on the message endpoint so a cross-origin page cannot
  inject actions) plus a persistent `Monitor` tailing the page's inbox; Claude writes
  `review.json` back and the page re-renders. "End session" exports
  `pr_reviews/review_{N}.md` in the `/pr-review` format (adds a `POSTED` status) so
  dismissals carry forward. GitHub-only, slash-only, never approves/merges/resolves.
- `/pr-review-interactive` documented in `README.md` (skill table, install instructions,
  requirements), the project `CLAUDE.md` structure tree, and the global `~/.claude/CLAUDE.md`
  skill list.

## [0.4.2] - 2026-08-30

### Added

- `/testing-gaps` skill — find the behaviors a change leaves untested. Scopes to the
  branch diff against main by default (or a named path; never the whole repo), learns the
  repo's test runner, layout, and conventions first, then enumerates every behavior in
  scope — happy path, branches, error paths, boundaries, side effects, state transitions,
  auth scoping, concurrency, integration seams — and matches each against the test tree.
  A behavior counts as covered only if a test exercises it *and asserts on the outcome*;
  tests that mock the subject, assert nothing, snapshot without intent, or are skipped are
  reported as **weak tests**. Gaps are ranked CRITICAL / IMPORTANT / MINOR by what silently
  breaks, and every gap ships with a concrete test case (file, title, arrange → act →
  assert). Offers to write CRITICAL or CRITICAL + IMPORTANT tests, proving each one can
  fail before running the full suite. Read-only otherwise; never commits or pushes.
- `/testing-gaps` documented in `README.md` (skill table and install instructions), the
  project `CLAUDE.md` structure tree, and the global `~/.claude/CLAUDE.md` skill list.

## [0.4.1] - 2026-08-27

### Added

- `/verify-this` skill — prove or disprove a specific claim with fresh local evidence
  instead of recapping what was done. Restates the claim in falsifiable form (condition,
  metric, threshold), captures a baseline from the old state and a treatment from the
  changed state using the same command, data, warmup, and environment, then compares raw
  artifacts and returns exactly one verdict: `VERIFIED`, `NOT VERIFIED`, or
  `INCONCLUSIVE`. Covers code, CLI/TUI, UI, API, performance, and memory surfaces, with
  an optional `/tmp/verify-this/<claim-slug>/` artifact layout that is skipped in favour
  of minimal inline evidence when the artifacts could carry sensitive code, prompts,
  screenshots, HTTP bodies, or heap data. Refuses unmeasurable claims ("the code is
  cleaner") and does not soften a negative result.
- `/pr-review-canvas` skill — render a GitHub PR as an interactive HTML walkthrough that
  reads like a peer talking you through the diff, rather than a wall of patch text.
  Pulls the PR, its files, and its review comments in parallel via `gh api`, splits core
  changes from mechanical ones, annotates the core files, and serves the result on
  `127.0.0.1:8432`. Ships three assets alongside `SKILL.md`: `styles.css` (dark theme,
  sticky file headers and notes), `renderer.js` (`toggle`, `toggleBP`, `esc`, and a
  `renderDiff` that filters import-only lines, collapses whitespace-only changes, and
  tints moved code blue/purple instead of red/green), and `template.html` (four
  injection markers the Python assembly step fills). Patches are routed through `jq` to
  a JSON file and injected with `<`, `>`, and `&` escaped, so a diff containing a
  literal `</script>` cannot terminate the embedding script tag early. Marked
  `disable-model-invocation: true` — it runs on `/pr-review-canvas`, not on its own.
- `/verify-this` and `/pr-review-canvas` documented in `README.md` (skill table,
  install instructions, and a Requirements entry for `/pr-review-canvas`'s GitHub-only
  `gh` + `python3` dependencies) and the project `CLAUDE.md` structure tree.

### Changed

- `/spec` — default standard issues now follow the PRO-8579 section order: Why,
  Desired outcome, Current behavior (research), Proposed architecture, Scope /
  non-goals, checkbox acceptance criteria, bounded open questions, and likely files.
  Blocking product and architecture decisions must be resolved before filing.
  Non-blocking implementation research may remain when it records evidence,
  recommendation, verification, and impact. Effort estimates, rollback plans,
  test-count tables, and similar sections are included only when they materially
  reduce risk.

### Fixed

- `README.md` — the install instruction's skill list was missing `/browse`; added it
  alongside `/verify-this`.
- `setup` — resolve `PROFX_DIR` with `pwd -P`. Invoking `./setup` through a symlinked
  path (e.g. `~/Code/prof-x` → `~/.claude/skills/prof-x`) left zsh's logical `pwd`
  pointing at the symlink, so `SKILLS_DIR` was the wrong parent, the
  `basename = "skills"` guard failed, and Claude Code registration was silently
  skipped — only Cursor got the symlinks.

## [0.4.0] - 2026-08-06

### Added

- `/start-vibing` skill — go from an idea to a running application on the canonical
  stack. Two gated phases (shape, then stack-deltas-and-confirm) keep the interrogation
  lighter than `/spec`'s five, then an 11-step build runs straight through to a dev
  server serving real rows. Governed by an Iron Law borrowed in spirit from
  `/investigate`: never hand back a scaffold that does not run — every build step ends
  in a verification command, and a red gate is fixed rather than papered over with
  `--force` or `ignoreBuildErrors`. The finish line is a working vertical slice (Prisma
  model → route handler → `lib/api.ts` → page → passing test), not a placeholder tree,
  and the run ends with a project `CLAUDE.md`, an initial commit, and a brief archived
  to `.context/vibes/`. Flags: `--service`, `--here`, `--no-slice`, `--deploy`.
- `start-vibing/stack-app.md` and `start-vibing/stack-service.md` — companion reference
  files following the `review/checklist.md` precedent, keeping `SKILL.md` scannable
  while holding the boilerplate. `stack-app.md` codifies the default Next.js shape
  (pnpm 10, Tailwind 3.4 + dark-only HSL tokens, no auth, plain `fetch` in `lib/api.ts`,
  Prisma client generated to `lib/generated/prisma`), with every config embedded verbatim
  so the skill is self-contained. Comments encoding real production failure modes (the
  `pg.Pool` timeouts, the load-bearing `prisma.config.ts`, the `vitest-env.d.ts`
  reference directive) are carried across intact; `typescript.ignoreBuildErrors` is
  deliberately excluded, with a note explaining why a fresh project should not start
  there. `stack-service.md` covers the `--service` shape (Fastify 5 + Drizzle + Vite SPA,
  npm workspaces, injected DB handle) and tabulates its deliberate divergences so they
  are not "fixed" toward the Next.js conventions.
- `/start-vibing` documented in `README.md` (skill table, install instructions, and a
  Requirements entry for its Node/pnpm/Docker preflight) and the project `CLAUDE.md`
  structure tree.

## [0.3.2] - 2026-06-25

### Changed

- `/pr-review` — reword the optional remediation line in the issue-format template from
  `**Fix:**` to `Suggested fix -`.

## [0.3.1] - 2026-06-25

### Changed

- `/browse` — promote optional session video recording to a first-class, documented
  pattern in the "Capturing a session as evidence" section. Adds the
  `video-show-actions`/`video-hide-actions` commands (annotate each interaction with an
  on-screen callout, element highlight, and animated cursor), documents the
  `video-start --size`, `video-show-actions --duration/--position/--cursor`, and
  `video-chapter --description/--duration` options, and clarifies that the browser must
  be open before `video-start` (recipe now `open` → `video-start` → `goto` so the first
  navigation is captured). Splits the video vs. trace guidance (video = human-watchable
  walkthrough; trace = full DOM/network replay) and updates the Evidence row of the Full
  Command List. Verified against `playwright-cli` v0.1.14.

## [0.3.0] - 2026-06-23

### Added

- `/spec` skill — author a backlog-ready spec by interrogating intent across five
  phases (understand the why, lock scope, interrogate the code, review the draft,
  file), then file it as a Linear issue. Adapted from gstack's `/spec` for prof-x's
  pure-Markdown, no-binary model: dropped the external `codex` quality gate,
  redaction/secret-scan scripts, telemetry, and the worktree agent-spawn pipeline.
  Dedupe and filing target Linear via the MCP (discover-tools pattern from
  `/pr-review`, with graceful degradation when the MCP is absent or `--local` is
  passed); every spec is also archived to `.context/specs/`. Keeps the 14
  issue-quality standards, the Standard/Epic/Audit templates, and the
  rules/anti-patterns. Flags: `--dedupe`/`--no-dedupe`, `--audit`, `--local`.
- `/spec` documented in `README.md` (skill table + install instructions) and the
  project `CLAUDE.md` structure tree.

## [0.2.1] - 2026-06-21

### Changed

- `setup` now prunes stale skill symlinks — on each run it removes any symlink in
  `~/.claude/skills/` that points into the prof-x clone but whose source skill directory
  no longer has a `SKILL.md` (e.g. a renamed or removed skill), reporting them under
  `pruned stale skills:`.

## [0.2.0] - 2026-06-21

### Added

- `/browse` skill — QA / dogfooding browser driven by the official `playwright-cli`
  (`@playwright/cli`). Navigate, interact via snapshot refs, assert element state with
  `eval`, diff before/after via `--raw snapshot`, screenshot, check responsive layouts,
  inspect console/network, mock routes, persist auth state, and hand off to an interactive
  review (`show --annotate`). Command reference matches the installed binary's real surface.
- `/browse` documented in `README.md` (skill table + a Requirements note covering the
  external `playwright-cli` dependency) and the project `CLAUDE.md` structure tree.

## [0.1.0] - 2026-06-21

### Added

- `/investigate` skill — systematic root-cause debugging with a five-phase workflow (investigation, pattern analysis, hypothesis testing, implementation, verification) and an Iron Law: no fixes without root-cause investigation first. Includes a 3-strike escalation rule and blast-radius checks via `AskUserQuestion`.
- `/investigate` documented in `README.md` (skill table and install instructions) and the project `CLAUDE.md` structure tree.

## [0.0.3] - 2026-06-21

### Changed

- Renamed the `/strategy-review` skill to `/plan-prod-review` (directory, `name:` frontmatter, and all references in `CLAUDE.md` and `README.md`).

## [0.0.2] - 2026-06-21

### Changed

- Renamed the `/arch-review` skill to `/plan-eng-review` (directory, `name:` frontmatter, and all references in `CLAUDE.md` and `README.md`).

### Added

- `.gitignore` excluding the `.claude/` directory.

## [0.0.1] - 2026-06-18

### Added

- Initial release: `/strategy-review`, `/arch-review`, `/review`, `/pr-review`, `/ship`, and `/retro` skills.
