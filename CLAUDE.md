# prof-x development

## Project structure

```
prof-x/
├── plan-prod-review/ # /plan-prod-review skill (CPO / staff PM plan review)
├── plan-eng-review/  # /plan-eng-review skill (eng manager / tech lead plan review)
├── review/           # /review skill + checklist.md (pre-landing review)
├── investigate/      # /investigate skill (systematic root-cause debugging)
├── pr-review/        # /pr-review skill (saves to file; wraps pr-review-toolkit)
├── ship/             # /ship skill (release workflow)
├── retro/            # /retro skill (engineering retrospective)
├── setup             # registers skills via symlinks + installs pr-review-toolkit
├── README.md
├── CHANGELOG.md
├── VERSION           # 3-digit semver, bumped by /ship
└── LICENSE
```

Each skill is a directory containing a `SKILL.md` (pure Markdown prompt, no code).
There is no build step and no binary — prof-x is a skill/prompt collection.

## Deploying to the active skill

The active install lives at `~/.claude/skills/prof-x/`, and `setup` symlinks each
skill directory up into `~/.claude/skills/` (e.g. `~/.claude/skills/review` →
`prof-x/review`) so each `/skill` is discoverable. Because the skills are symlinks
into the clone, pulling latest is all that's needed — no rebuild.

After making changes:

1. Push your branch (or merge to `main`).
2. Update the clone: `cd ~/.claude/skills/prof-x && git fetch origin && git reset --hard origin/main`
3. Re-run `./setup` only if you added a **new** skill directory (to create its symlink)
   or need to (re)install the `pr-review-toolkit` plugin.
