# Changelog

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
