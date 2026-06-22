# Changelog

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
