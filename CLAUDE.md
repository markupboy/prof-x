# prof-x development

## Project structure

```
prof-x/
├── skills/           # slash-invoked skills (each dir has SKILL.md)
│   ├── spec/             # /spec (interrogate intent → file a Linear issue)
│   ├── start-vibing/     # /start-vibing (idea → running app) + stack-app.md, stack-service.md
│   ├── plan-prod-review/ # /plan-prod-review (CPO / staff PM plan review)
│   ├── plan-eng-review/  # /plan-eng-review (eng manager / tech lead plan review)
│   ├── review/           # /review + checklist.md (pre-landing review)
│   ├── pr-review/        # /pr-review (saves to file; wraps pr-review-toolkit)
│   ├── pr-feedback/      # /pr-feedback (validate a PR review thread → proceed / clarify / push back)
│   ├── ship/             # /ship (release workflow)
│   ├── browse/           # /browse (Playwright-cli QA / dogfooding browser)
│   ├── testing-gaps/     # /testing-gaps (find untested behaviors in a diff, ranked, with test cases)
│   └── use-conversational-language/ # /use-conversational-language (natural voice for human-facing text)
├── rules/            # always-on agent rules
│   └── no-nonsense-comments.md # durable, context-free code comments
├── setup             # registers skills and rules (Claude Code + Cursor) + installs pr-review-toolkit
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
`prof-x/skills/review`; created if missing) so the same skills work in Cursor. Rules are
symlinked into `~/.claude/rules/` (`.md`) and `~/.cursor/rules/` (`.mdc`).
Because the installed links point into the clone, pulling latest is all that's needed — no rebuild.

After making changes:

1. Push your branch (or merge to `main`).
2. Update the clone: `cd ~/.claude/skills/prof-x && git fetch origin && git reset --hard origin/main`
3. Re-run `./setup` only if you added a **new** skill or rule (to create its symlink)
   or need to (re)install the `pr-review-toolkit` plugin.
