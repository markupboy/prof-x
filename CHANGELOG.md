# Changelog

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
