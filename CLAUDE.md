# prof-x development

## Project structure

```
prof-x/
├── skills/           # slash-invoked skills (each dir has SKILL.md)
│   ├── spec/             # /spec (interrogate intent → file a Linear issue)
│   ├── implement/        # /implement (Linear ticket → plan → implement → validate → optionally ship)
│   ├── start-vibing/     # /start-vibing (idea → running app) + stack-app.md, stack-service.md
│   ├── plan-prod-review/ # /plan-prod-review (CPO / staff PM plan review)
│   ├── plan-eng-review/  # /plan-eng-review (eng manager / tech lead plan review)
│   ├── review/           # /review + checklist.md (pre-landing review)
│   ├── investigate/      # /investigate (systematic root-cause debugging)
│   ├── pr-review/        # /pr-review (saves to file; wraps pr-review-toolkit)
│   ├── pr-review-canvas/ # /pr-review-canvas (interactive HTML PR walkthrough) + styles.css, renderer.js, template.html
│   ├── pr-review-interactive/ # /pr-review-interactive (browser triage) + server.py, index.html, app.js, renderer.js, styles.css
│   ├── pr-feedback/      # /pr-feedback (validate a PR review thread → proceed / clarify / push back)
│   ├── ship/             # /ship (release workflow)
│   ├── retro/            # /retro (engineering retrospective)
│   ├── browse/           # /browse (Playwright-cli QA / dogfooding browser)
│   ├── verify-this/      # /verify-this (prove or disprove a claim with baseline/treatment evidence)
│   └── testing-gaps/     # /testing-gaps (find untested behaviors in a diff, ranked, with test cases)
├── rules/            # (planned) always-on agent rules — not shipped yet
├── setup             # registers skills (Claude Code + Cursor) via symlinks + installs pr-review-toolkit
├── README.md
├── CHANGELOG.md
├── VERSION           # 3-digit semver, bumped by /ship
└── LICENSE
```

Each skill is a directory containing a `SKILL.md` (pure Markdown prompt, no code).
There is no build step and prof-x ships no binary of its own — it's a skill/prompt
collection. (`/browse` is the one skill that drives an *external* binary, the official
`playwright-cli` / `@playwright/cli`; it is not bundled.)

## Deploying to the active skill

The active install lives at `~/.claude/skills/prof-x/`, and `setup` symlinks each
skill directory up into `~/.claude/skills/` (e.g. `~/.claude/skills/review` →
`prof-x/skills/review`) so each `/skill` is discoverable. It also symlinks each skill into
Cursor's personal skills dir at `~/.cursor/skills/` (e.g. `~/.cursor/skills/review` →
`prof-x/skills/review`; created if missing) so the same skills work in Cursor. Because the
skills are symlinks into the clone, pulling latest is all that's needed — no rebuild.

After making changes:

1. Push your branch (or merge to `main`).
2. Update the clone: `cd ~/.claude/skills/prof-x && git fetch origin && git reset --hard origin/main`
3. Re-run `./setup` only if you added a **new** skill directory (to create its symlink)
   or need to (re)install the `pr-review-toolkit` plugin.
