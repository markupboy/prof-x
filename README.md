# Prof-X

!["To me, my X-Men."](https://blake-walters.com/images/profx.webp)
_© Marvel Characters, Inc. / Marvel Comics. All rights reserved._

**Prof-X is an opinionated setup of Claude Code to assist in my day-to-day AI coding assistant needs, both personally and professionally.**

Included here are skills for plan review, code review, and rules for
consistent agent behavior.

### Included skills

| Skill              | Mode                    | What it does                                                                           |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------- |
| `/spec`            | Principal engineer      | Interrogate intent across five phases, then file a backlog-ready Linear issue          |
| `/start-vibing`    | Staff engineer          | Idea → running app on the canonical stack, with one feature working end to end          |
| `/plan-prod-review` | CPO / staff PM          | Evaluate the problem, align on the outcome, prep for breakdown and handoff             |
| `/plan-eng-review` | Eng manager / Tech lead | Lock in architecture, data flow, diagrams, edge cases, and tests                       |
| `/review`          | Paranoid staff engineer | Find the bugs that pass CI but blow up in production. Not a style nitpick pass         |
| `/pr-review`       | Paranoid staff engineer | Critical review of a PR authored by someone other than self                            |
| `/review-code-assistant` | Pair reviewer     | Local read-only review of a branch/PR diff; suggest pasteable comments, never post     |
| `/fetch-pr-review` | Review secretary        | Capture every comment on a PR URL into a self-contained `.PR-REVIEW.md`; fetch only, no triage or replies |
| `/refine-pr-review` | Author's advocate      | Triage a fetched PR-REVIEW file with the user, draft replies, and write REQUIREMENTS for accepted changes |
| `/pr-feedback`     | Author's advocate       | Validate a GitHub PR review thread against the code, then PROCEED, CLARIFY, or PUSH BACK — replies to the thread only with explicit permission |
| `/ship`            | Release engineer        | Sync main, run test, push, open PR. For a ready branch, not for deciding what to build |
| `/browse`          | QA / dogfooding         | Drive headless Chromium via `playwright-cli` — navigate, interact, assert, diff, screenshot |
| `/testing-gaps`    | QA lead                 | Find the behaviors a change leaves untested, ranked by blast radius, each with a concrete test case |
| `/use-conversational-language` | Copy editor | Write human-facing text in a concise, natural voice without changing what it says |

### Included rules

| Rule | What it does |
| ---- | ------------ |
| `git-read-only-by-default` | Keeps Git read-only unless the user explicitly requests a write action |
| `no-nonsense-comments` | Short, durable comments that make sense without session context. Uses `/use-conversational-language` for any it writes |
| `plans-directory` | Saves planning documents in a consistent project-relative directory structure |
| `self-contained-docs` | Makes plans and design documents concise and executable without prior context |
| `write-realistic-texts` | Applies a conversational voice and explicit publication approval to user-authored text |

## Who is this for

Me and only me, really. I have no intention of this being used in its entirety end-to-end by other individuals. I've drawn inspiration from [gstack](https://github.com/garrytan/gstack) and other sources and refined for my own use. I suspect folks looking at this repo will do the same.

## Installation

> Install prof-x: run `git clone https://github.com/markupboy/prof-x.git ~/.claude/skills/prof-x && cd ~/.claude/skills/prof-x && ./setup` (this also installs the `pr-review-toolkit` plugin that `/pr-review` depends on — see [Requirements](#requirements)) then add a "prof-x" section to CLAUDE.md that lists the available skills: /spec, /start-vibing, /plan-prod-review, /plan-eng-review, /review, /pr-review, /review-code-assistant, /fetch-pr-review, /refine-pr-review, /pr-feedback, /ship, /browse, /testing-gaps, /use-conversational-language.

### What gets installed

- Skill files (Markdown prompts) in `~/.claude/skills/prof-x/skills/` (or `.claude/skills/prof-x/skills/` for project installs)
- `setup` symlinks every skill directory up into the Claude Code skills dir (e.g. `~/.claude/skills/review` → `prof-x/skills/review`) so each `/skill` is discoverable
- `setup` also symlinks every skill into Cursor's personal skills dir (`~/.cursor/skills/review` → `prof-x/skills/review`), so the same skills are available in Cursor (the dir is created if missing)
- Rule files in `~/.claude/skills/prof-x/rules/`; `setup` links them as always-on personal rules in Claude Code (`~/.claude/rules/*.md`) and Cursor (`~/.cursor/rules/*.mdc`)
- `setup` also installs the `pr-review-toolkit` plugin (idempotent — skipped if already present; see [Requirements](#requirements))

Everything lives inside `.claude/` and `.cursor/`. Nothing touches your PATH or runs in the background.

### Requirements

Most skills only need `git` plus the host's CLI (`gh` for GitHub, the Gitea MCP for Gitea). A few skills have extra dependencies.

`/start-vibing` needs a working local toolchain, since it builds and runs a real application:

- **Node 22+**, **pnpm 10** (`corepack enable && corepack prepare pnpm@10.33.0 --activate`), and a **running Docker daemon** for the Postgres container. The skill preflights all three and stops early rather than failing halfway through a scaffold.
- `--deploy` additionally assumes access to `gitea.hoth.cc` and the `hoth.cc` manifests repo. It always confirms before creating a remote repo or pushing a manifest.

`/browse` requires the official **`playwright-cli`** binary (`@playwright/cli`) on `PATH`:

- Install with `brew install playwright-cli` (macOS) or `npm install -g @playwright/cli@latest`. The skill also falls back to a local `npx --no-install playwright-cli` if a project pins it.
- First run may prompt to download a Chromium build (`playwright-cli install-browser`). Nothing is bundled with prof-x.

`/fetch-pr-review` and `/review-code-assistant` use the connected host tools when a PR URL is given (`gh` / GitHub MCP, Azure DevOps MCP, or equivalent). Without a matching tool they stop (`/fetch-pr-review`) or fall back to a local three-dot git diff (`/review-code-assistant`). `/refine-pr-review` is file-in/file-out: it never posts to the PR.

`/pr-feedback` is GitHub-only and read-only against GitHub by default:

- **`gh` (required).** The feedback thread and PR context come from `gh api` (REST + GraphQL) — there is no Gitea path. Clarifying questions and push-back drafts are produced in the session for the author to post themselves; the skill never replies to a thread on its own initiative, but it may post a user-confirmed reply when explicitly asked. Resolving threads or any other mutation stays off-limits.

`/pr-review` has two extra dependencies:

- **`pr-review-toolkit` (required).** `/pr-review` wraps it — it invokes `/pr-review-toolkit:review-pr` to do the actual analysis, then adds Linear-awareness and file output on top. `./setup` installs it for you (`claude plugin install pr-review-toolkit@claude-plugins-official`); without it, `/pr-review` cannot run.
- **A Linear MCP server (optional).** When present, `/pr-review` fetches the linked Linear ticket and scores the PR against its acceptance criteria. When absent, it degrades gracefully — it notes the ticket reference but skips the criterion-level analysis. No Linear key in the branch/PR means this is skipped entirely.
