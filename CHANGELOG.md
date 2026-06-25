# Changelog

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
