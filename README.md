# Prof-X

!["To me, my X-Men."](https://blake-walters.com/images/profx.webp)
_© Marvel Characters, Inc. / Marvel Comics. All rights reserved._

**Prof-X is an opinionated setup of Claude Code to assist in my day-to-day AI coding assistant needs, both personally and professionally.**

Included here are skills for plan review, code review, engineering retrospectives, and rules for
consistent agent behavior.

### Included skills

| Skill              | Mode                    | What it does                                                                           |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------- |
| `/spec`            | Principal engineer      | Interrogate intent across five phases, then file a backlog-ready Linear issue          |
| `/implement`       | Staff engineer          | Pick up a Linear ticket, isolate it in a worktree, plan, implement, validate, optionally ship |
| `/start-vibing`    | Staff engineer          | Idea → running app on the canonical stack, with one feature working end to end          |
| `/plan-prod-review` | CPO / staff PM          | Evaluate the problem, align on the outcome, prep for breakdown and handoff             |
| `/plan-eng-review` | Eng manager / Tech lead | Lock in architecture, data flow, diagrams, edge cases, and tests                       |
| `/review`          | Paranoid staff engineer | Find the bugs that pass CI but blow up in production. Not a style nitpick pass         |
| `/investigate`     | Systematic debugger     | Root-cause investigation before any fix. Iron Law: no fixes without root cause         |
| `/pr-review`       | Paranoid staff engineer | Critical review of a PR authored by someone other than self                            |
| `/pr-review-canvas` | Reviewer's reviewer    | Render a GitHub PR as an interactive HTML walkthrough — annotated diffs, moved-code detection, pseudocode summaries |
| `/pr-review-interactive` | Reviewer at the keyboard | Same analysis as `/pr-review`, served as a local interactive page — each finding with its diff hunk; verify, reframe, ask, dismiss, and queue → submit findings as one GitHub review from the browser |
| `/pr-feedback`     | Author's advocate       | Validate a GitHub PR review thread against the code, then PROCEED, CLARIFY, or PUSH BACK — replies to the thread only with explicit permission |
| `/ship`            | Release engineer        | Sync main, run test, push, open PR. For a ready branch, not for deciding what to build |
| `/retro`           | Engineering manager     | Analyze commit history, work patterns, and shipping velocity for the week.             |
| `/browse`          | QA / dogfooding         | Drive headless Chromium via `playwright-cli` — navigate, interact, assert, diff, screenshot |
| `/verify-this`     | Skeptical verifier      | Prove or disprove a claim with baseline vs. treatment evidence. Returns VERIFIED / NOT VERIFIED / INCONCLUSIVE |
| `/testing-gaps`    | QA lead                 | Find the behaviors a change leaves untested, ranked by blast radius, each with a concrete test case |
| `/use-conversational-language` | Copy editor | Write human-facing text in a concise, natural voice without changing what it says |

### Included rules

| Rule | What it does |
| ---- | ------------ |
| `no-nonsense-comments` | Short, durable comments that make sense without session context. Uses `/use-conversational-language` for any it writes |

## Who is this for

Me and only me, really. I have no intention of this being used in its entirety end-to-end by other individuals. I've drawn inspiration from [gstack](https://github.com/garrytan/gstack) and other sources and refined for my own use. I suspect folks looking at this repo will do the same.

## Installation

> Install prof-x: run `git clone https://github.com/markupboy/prof-x.git ~/.claude/skills/prof-x && cd ~/.claude/skills/prof-x && ./setup` (this also installs the `pr-review-toolkit` plugin that `/pr-review` depends on — see [Requirements](#requirements)) then add a "prof-x" section to CLAUDE.md that lists the available skills: /spec, /implement, /start-vibing, /plan-prod-review, /plan-eng-review, /review, /investigate, /pr-review, /pr-review-canvas, /pr-review-interactive, /pr-feedback, /ship, /retro, /browse, /verify-this, /testing-gaps, /use-conversational-language.

### What gets installed

- Skill files (Markdown prompts) in `~/.claude/skills/prof-x/skills/` (or `.claude/skills/prof-x/skills/` for project installs)
- `setup` symlinks every skill directory up into the Claude Code skills dir (e.g. `~/.claude/skills/review` → `prof-x/skills/review`) so each `/skill` is discoverable
- `setup` also symlinks every skill into Cursor's personal skills dir (`~/.cursor/skills/review` → `prof-x/skills/review`), so the same skills are available in Cursor (the dir is created if missing)
- Rule files in `~/.claude/skills/prof-x/rules/`; `setup` links them as always-on personal rules in Claude Code (`~/.claude/rules/*.md`) and Cursor (`~/.cursor/rules/*.mdc`)
- `setup` also installs the `pr-review-toolkit` plugin (idempotent — skipped if already present; see [Requirements](#requirements))
- `/retro` saves JSON snapshots to `.context/retros/` in your project for trend tracking

Everything lives inside `.claude/` and `.cursor/`. Nothing touches your PATH or runs in the background.

### Requirements

Most skills only need `git` plus the host's CLI (`gh` for GitHub, the Gitea MCP for Gitea). Six skills have extra dependencies.

`/implement` needs a Linear source of truth and will **stop immediately** if neither is present:

- **Linear MCP or the `linear` CLI (required).** The skill fetches the ticket id, description, and acceptance criteria from Linear — it will not improvise them. MCP is preferred when authenticated; otherwise `linear` on `PATH` (or `npx @schpet/linear-cli`).
- **`wt` (optional).** When Worktrunk is on `PATH`, ticket worktrees are created with `wt switch --create`. Otherwise the skill falls back to `git worktree add`.
- **Bugbot (optional).** In Cursor, Validation runs `/review-bugbot` and remediates findings. When the subagent is unavailable, that step is skipped.

`/start-vibing` needs a working local toolchain, since it builds and runs a real application:

- **Node 22+**, **pnpm 10** (`corepack enable && corepack prepare pnpm@10.33.0 --activate`), and a **running Docker daemon** for the Postgres container. The skill preflights all three and stops early rather than failing halfway through a scaffold.
- `--deploy` additionally assumes access to `gitea.hoth.cc` and the `hoth.cc` manifests repo. It always confirms before creating a remote repo or pushing a manifest.

`/browse` requires the official **`playwright-cli`** binary (`@playwright/cli`) on `PATH`:

- Install with `brew install playwright-cli` (macOS) or `npm install -g @playwright/cli@latest`. The skill also falls back to a local `npx --no-install playwright-cli` if a project pins it.
- First run may prompt to download a Chromium build (`playwright-cli install-browser`). Nothing is bundled with prof-x.

`/pr-review-canvas` is GitHub-only and renders a local page:

- **`gh` (required).** All PR data comes from `gh api` — there is no Gitea path, so this skill does not work against `gitea.hoth.cc`. Use `/pr-review` there.
- **`python3` (required).** Used to assemble the HTML safely and to serve it via `python3 -m http.server` on `127.0.0.1:8432`. The page is served locally and never published.
- Slash-only: the skill sets `disable-model-invocation: true`, so it runs when you type `/pr-review-canvas`, not on its own.

`/pr-review-interactive` is GitHub-only and runs a local server for the length of the session:

- **`pr-review-toolkit` (required).** The analysis is `/pr-review`'s steps 1–3b, run by reference — same calibration, same Linear-awareness. Without the toolkit it stops.
- **`gh` (required)** for PR data and for posting; **`python3` (required)** to run the bundled stdlib `server.py` on `127.0.0.1:8433` (next free port if taken). The page is local and never published.
- Actions in the page (verify, reframe, ask, dismiss, queue, post) reach Claude through a file inbox that a persistent `Monitor` tails, so the terminal stays free; Claude writes the state file back and the page re-renders. Typing in the terminal still works.
- GitHub writes happen only from an explicit in-page confirmation of the exact comment text — a single inline comment, or one review (`COMMENT` / `REQUEST_CHANGES`) containing every queued comment. It never approves, merges, resolves threads, or edits comments. WIP (no PR) sessions cannot post.
- "End session" exports `pr_reviews/review_{N}.md` in the `/pr-review` format (with a `POSTED` status for comments that went to GitHub), so later `/pr-review` runs carry dismissals forward. Slash-only (`disable-model-invocation: true`).

`/pr-feedback` is GitHub-only and read-only against GitHub by default:

- **`gh` (required).** The feedback thread and PR context come from `gh api` (REST + GraphQL) — there is no Gitea path. Clarifying questions and push-back drafts are produced in the session for the author to post themselves; the skill never replies to a thread on its own initiative, but it may post a user-confirmed reply when explicitly asked. Resolving threads or any other mutation stays off-limits.

`/pr-review` has two extra dependencies:

- **`pr-review-toolkit` (required).** `/pr-review` wraps it — it invokes `/pr-review-toolkit:review-pr` to do the actual analysis, then adds Linear-awareness and file output on top. `./setup` installs it for you (`claude plugin install pr-review-toolkit@claude-plugins-official`); without it, `/pr-review` cannot run.
- **A Linear MCP server (optional).** When present, `/pr-review` fetches the linked Linear ticket and scores the PR against its acceptance criteria. When absent, it degrades gracefully — it notes the ticket reference but skips the criterion-level analysis. No Linear key in the branch/PR means this is skipped entirely.
