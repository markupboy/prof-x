---
name: browse
version: 1.0.0
description: |
  Playwright-cli browser for QA testing and site dogfooding. Navigate any URL, interact with
  elements, verify page state, diff before/after actions, take screenshots, check responsive
  layouts, test forms and uploads, handle dialogs, inspect console/network, and assert element
  states. Use when you need to test a feature, verify a deployment, dogfood a user flow, or
  file a bug with evidence. Use when asked to "open in browser", "test the site", "take a
  screenshot", "browse a page", "headless browser", or "dogfood this".
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

# browse: QA Testing & Dogfooding

Headless Chromium via the official **`@playwright/cli`** (`playwright-cli`).

```bash
# Resolve the binary once. Prefer the global command; fall back to a local npx copy.
B="$(command -v playwright-cli || echo 'npx --no-install playwright-cli')"
```

Not installed? `brew install playwright-cli` (macOS) or `npm install -g @playwright/cli@latest`.

**Refs.** Every command prints a page snapshot whose interactive elements are labelled `e1`,
`e2`, … — pass those bare refs to `click`, `fill`, etc. (no `@` prefix). You can also target by
CSS selector or Playwright locator (see [Targeting elements](#targeting-elements)). Take a fresh
`snapshot` after anything that mutates the DOM — refs from a stale snapshot can move.

## Core QA Patterns

### 1. Verify a page loads correctly

```bash
$B open https://yourapp.com         # opens browser + navigates (prints a snapshot)
$B console                          # JS errors / warnings?
$B requests                         # any failed/red requests?
$B eval "!!document.querySelector('.main-content')"   # key element present? -> true/false
```

### 2. Test a user flow

```bash
$B open https://app.com/login
$B snapshot                          # see refs for the interactive elements
$B fill e3 "user@test.com"
$B fill e4 "password" --submit       # --submit presses Enter after filling
$B snapshot                          # what does the page look like now?
$B eval "!!document.querySelector('.dashboard')"   # success state present?
```

### 3. Verify an action worked (before/after diff)

There's no built-in diff; capture raw snapshots and `diff` them. `--raw` strips status/codes
and prints only the snapshot YAML.

```bash
$B --raw snapshot > /tmp/before.yml   # baseline
$B click e3                           # do something
$B --raw snapshot > /tmp/after.yml
diff /tmp/before.yml /tmp/after.yml   # exactly what changed
```

### 4. Visual evidence for bug reports

```bash
$B screenshot --filename=/tmp/bug.png            # current viewport
$B screenshot --filename=/tmp/full.png --full-page
$B screenshot e5 --filename=/tmp/element.png     # just one element (by ref or selector)
$B console                                        # error log to quote in the report
```

Then **Read** the PNG (see pattern 11) so it's visible.

### 5. Assert element states

No `is` command — assert with `eval`, which returns the expression result. Pass an element ref
as the second arg to get an `el => …` callback bound to that element.

```bash
$B eval "!!document.querySelector('.modal')"      # visible/present  -> true
$B eval "el => !el.disabled" e5                    # enabled
$B eval "el => el.disabled" e5                     # disabled
$B eval "el => el.checked" e5                       # checked
$B eval "el => !el.readOnly && !el.disabled" e5     # editable
$B eval "el => el === document.activeElement" e5    # focused
$B eval "document.body.textContent.includes('Success')"
```

### 6. Get attributes not shown in the snapshot

```bash
$B eval "el => el.id" e5
$B eval "el => el.className" e5
$B eval "el => el.getAttribute('data-testid')" e5
```

### 7. Test responsive layouts

No `responsive`/`--scale` command; loop `resize` + `screenshot`.

```bash
for vp in 375x812 768x1024 1440x900; do
  $B resize ${vp%x*} ${vp#*x}
  $B screenshot --filename=/tmp/layout-$vp.png
done
```

### 8. Test file uploads

```bash
$B click e3                          # the file <input> / "Choose file" button
$B upload ./path/to/file.pdf         # answers the file chooser (one or more paths)
$B eval "!!document.querySelector('.upload-success')"
```

### 9. Test dialogs (alert / confirm / prompt)

```bash
$B dialog-accept "yes"               # pre-arm the handler (text only for prompts)
$B click e4                          # trigger the dialog
$B --raw snapshot > /tmp/after.yml   # verify the side effect happened
# or $B dialog-dismiss to cancel instead
```

### 10. Inspect the network

```bash
$B requests                          # numbered list of all requests since load
$B request 5                         # full headers + body + response for #5
$B response-body 5                   # just the response body (binary -> saved to file)
```

### 11. Show screenshots to the user

After `$B screenshot`, **always `Read` the output PNG** so the user can see it. Without the
Read, the screenshot is invisible to them.

### 12. Render local HTML (no HTTP server needed)

```bash
$B goto file:///tmp/report.html      # absolute file:// URL
$B screenshot e1 --filename=/tmp/out.png   # screenshot the element by ref/selector
```

Relative asset URLs resolve against the file's directory. (This CLI has no `--scale` /
deviceScaleFactor flag and no in-memory `setContent`; write HTML to a file and `goto file://`.)

### 13. Persisted auth / storage state

Log in once, save the state, reuse it so later runs skip the login flow.

```bash
$B state-save /tmp/auth.json         # after logging in
# later / in another session:
$B open https://app.com
$B state-load /tmp/auth.json
$B reload
```

`cookie-*`, `localstorage-*`, and `sessionstorage-*` commands read/write individual entries.

### 14. Mock network responses

```bash
$B route "**/api/flaky" --status=500            # force an error
$B route "https://api.example.com/**" --body='{"mock": true}'
$B route-list
$B unroute                                       # clear all routes
$B network-state-set offline                     # test offline behaviour
```

## Capturing a session as evidence

For flaky bugs or repro steps, record a trace or video instead of stitching screenshots:

```bash
$B tracing-start ; $B click e4 ; $B fill e7 "test" ; $B tracing-stop   # Playwright trace
$B video-start /tmp/repro.webm ; $B click e4 ; $B video-stop           # screen recording
```

## User Handoff (interactive review)

When you hit something headless can't handle (CAPTCHA, MFA, OAuth) or you want the user's eyes
on the page, open the interactive review. The user draws boxes and types comments; you get back
the annotated screenshot, the snapshot of the marked region, and their notes.

```bash
$B show --annotate
```

Pair it with `AskUserQuestion` to tell the user what you need ("solve the CAPTCHA, then tell me
done"). Browser state (cookies, localStorage, tabs) is preserved throughout — re-`snapshot` after
the user finishes and continue.

## Named sessions & browser choice

```bash
$B open https://app.com --persistent        # persistent profile (survives close)
$B open https://app.com --browser=firefox   # chrome | firefox | webkit | msedge
$B -s=staging open https://staging.app.com  # named session, run in parallel
$B -s=staging click e6
$B list                                       # list live sessions
$B close                                      # close the default session
$B kill-all                                   # forcefully clear stale/zombie processes
```

To diff two environments, run a named session against each and `diff` their `--raw snapshot`
output (pattern 3).

## Targeting elements

Refs from the latest snapshot are the default. You can also use CSS selectors or Playwright
locators anywhere a target is accepted:

```bash
$B click e15                                       # ref from snapshot
$B click "#main > button.submit"                   # CSS selector
$B click "getByRole('button', { name: 'Submit' })" # role locator
$B click "getByTestId('submit-button')"            # test id
```

## Snapshot Flags

`snapshot [target]` captures the page (or one element) and the refs you interact with.

| Flag | Effect |
| --- | --- |
| `[target]` | a ref (`e34`) or selector — partial snapshot of that element instead of the whole page |
| `--filename=<file>` | save the snapshot to a markdown/yaml file instead of returning it inline |
| `--depth=<n>` | limit snapshot depth (unlimited by default) — cheaper for large pages |
| `--boxes` | include each element's bounding box as `[box=x,y,width,height]` (viewport CSS px) |

Global output flags (any command): `--raw` prints only the result value (great for piping /
`diff`); `--json` wraps the whole reply as JSON.

## Full Command List

```text
Core:        open [url] · goto <url> · close · reload · go-back · go-forward
Interact:    click <t> · dblclick <t> · fill <t> <text> [--submit] · type <text> ·
             press <key> · hover <t> · select <t> <val> · check <t> · uncheck <t> ·
             upload <file...> · drag <a> <b> · drop <t> · resize <w> <h>
Inspect:     snapshot [t] · eval <fn> [t] · screenshot [t] · pdf · console [level] ·
             requests · request <n> · request-headers <n> · response-body <n> ·
             generate-locator <t> · highlight [t]
Dialogs:     dialog-accept [text] · dialog-dismiss
Tabs:        tab-list · tab-new [url] · tab-close [i] · tab-select <i>
Storage:     state-save [file] · state-load <file> · cookie-{list,get,set,delete,clear} ·
             localstorage-{list,get,set,delete,clear} · sessionstorage-{…}
Network:     route <pattern> · route-list · unroute [pattern] · network-state-set <on|off>
Evidence:    tracing-{start,stop} · video-{start,stop,chapter} · show [--annotate]
Sessions:    -s=<name> · list · close-all · kill-all · open --persistent|--profile=|--browser=
Code:        run-code [code|--filename]
Global opts: --raw · --json · --help [command] · --version
```

Run `$B --help` or `$B <command> --help` for the authoritative, version-specific reference.
