# Prof-X

_To me, my X-Men!_

**Prof-X is an opinionated setup of Claude Code to assist in my day-to-day AI coding assistant needs, both personally and professionally.**

Included here are skills for plan review, code review, and engineering retrospectives.

### Included skills

| Skill              | Mode                    | What it does                                                                           |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------- |
| `/plan-prod-review` | CPO / staff PM          | Evaluate the problem, align on the outcome, prep for breakdown and handoff             |
| `/plan-eng-review` | Eng manager / Tech lead | Lock in architecture, data flow, diagrams, edge cases, and tests                       |
| `/review`          | Paranoid staff engineer | Find the bugs that pass CI but blow up in production. Not a style nitpick pass         |
| `/investigate`     | Systematic debugger     | Root-cause investigation before any fix. Iron Law: no fixes without root cause         |
| `/pr-review`       | Paranoid staff engineer | Critical review of a PR authored by someone other than self                            |
| `/ship`            | Release engineer        | Sync main, run test, push, open PR. For a ready branch, not for deciding what to build |
| `/retro`           | Engineering manager     | Analyze commit history, work patterns, and shipping velocity for the week.             |
| `/browse`          | QA / dogfooding         | Drive headless Chromium via `playwright-cli` — navigate, interact, assert, diff, screenshot |

## Who is this for

Me and only me, really. I have no intention of this being used in its entirety end-to-end by other individuals. I've drawn inspiration from [gstack](https://github.com/garrytan/gstack) and other sources and refined for my own use. I suspect folks looking at this repo will do the same.

## Installation

> Install prof-x: run `git clone https://github.com/markupboy/prof-x.git ~/.claude/skills/prof-x && cd ~/.claude/skills/prof-x && ./setup` (this also installs the `pr-review-toolkit` plugin that `/pr-review` depends on — see [Requirements](#requirements)) then add a "prof-x" section to CLAUDE.md that lists the available skills: /plan-prod-review, /plan-eng-review, /review, /investigate, /pr-review, /ship, /retro.

### What gets installed

- Skill files (Markdown prompts) in `~/.claude/skills/prof-x/` (or `.claude/skills/prof-x/` for project installs)
- `setup` symlinks every skill directory up into the skills dir (e.g. `~/.claude/skills/review` → `prof-x/review`) so each `/skill` is discoverable
- `setup` also installs the `pr-review-toolkit` plugin (idempotent — skipped if already present; see [Requirements](#requirements))
- `/retro` saves JSON snapshots to `.context/retros/` in your project for trend tracking

Everything lives inside `.claude/`. Nothing touches your PATH or runs in the background.

### Requirements

Most skills only need `git` plus the host's CLI (`gh` for GitHub, the Gitea MCP for Gitea). Two skills have extra dependencies.

`/browse` requires the official **`playwright-cli`** binary (`@playwright/cli`) on `PATH`:

- Install with `brew install playwright-cli` (macOS) or `npm install -g @playwright/cli@latest`. The skill also falls back to a local `npx --no-install playwright-cli` if a project pins it.
- First run may prompt to download a Chromium build (`playwright-cli install-browser`). Nothing is bundled with prof-x.

`/pr-review` has two extra dependencies:

- **`pr-review-toolkit` (required).** `/pr-review` wraps it — it invokes `/pr-review-toolkit:review-pr` to do the actual analysis, then adds Linear-awareness and file output on top. `./setup` installs it for you (`claude plugin install pr-review-toolkit@claude-plugins-official`); without it, `/pr-review` cannot run.
- **A Linear MCP server (optional).** When present, `/pr-review` fetches the linked Linear ticket and scores the PR against its acceptance criteria. When absent, it degrades gracefully — it notes the ticket reference but skips the criterion-level analysis. No Linear key in the branch/PR means this is skipped entirely.
