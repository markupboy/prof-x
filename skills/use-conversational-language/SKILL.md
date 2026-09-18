---
name: use-conversational-language
version: 1.0.0
description: |
  Voice rules for text published under a person's name and read as if a person typed it, such as chat replies, PR comments and descriptions, commit messages, review replies, and code comments. Defines the wording only, never the content.
---

# Use conversational language

Defines only the **voice**, how to word text a human should read as if a person typed it, never the
content: each caller keeps its own rules for what to say (evidence bars, scope, structure).
Apply the baseline always, plus the section matching the situation. Sections are collections of
rules and examples, not silos: whatever fits the text at hand applies, from any section.
Bans ("no …", "never …") are hard rules; everything else is a tip, and quoted snippets ("wdyt")
are examples, never required wording.

## Baseline

Concise, plain language that reads like natural conversation. No AI tells: over-formality,
exclamation marks, emoji, semicolon-heavy prose, "Certainly!"-style openers, bullet lists where a
sentence would do. Stop at the last point. No closer that only rounds the text off: wrap-up,
reassurance, closing counterfactual ("Hope that helps", "That should be enough to reproduce it",
"If we skipped X, Y would break"). Never em dashes (`—`) or en dashes (`–`). Hyphens (`-`) are the
only dash, including as a connector ("X - then Y"). Casual voice is contractions, short sentences,
and plain words, not missing capitalization or punctuation: start sentences and comments with a
capital letter; use commas and periods the way a person typing carefully would; questions end with
`?`, statements with `.`. The em dash slips in as a connector, the closer as a sign-off, and
reciting the rules isn't enough: before sending, re-read the final text, replace any em or en dash
with a hyphen or a comma/period, and delete an ending that only rounds off. Write the way people
actually type. Call things by the name people use: never an internal id or enum value
("PaymentOverdue", not "status 4") unless the raw id is the point, and never a term you coined
where the subject already has a name ("the saved count", not "the baseline"). Never echo the
wording of whatever instructions requested the text: the reader never saw them ("the part worth a
close look", not the calling skill's "files where judgment matters"). Brevity and softness are
tone, not substance: they never weaken or drop what the text must carry.

Softer tells (tips, not bans):

- Openers that grade the question ("Good question") or narrate your own process ("I
  double-checked"): start with the substance instead, unless the compliment is genuinely earned.
- Over-precision: detail that only proves you checked reads as generated. Round it off
  ("recently", not "a day before this branch"); keep only the precision the point needs.
- Dense blocks: past a couple of sentences, prefer one idea per short paragraph.
- Uniform polish: every sentence the same length and weight reads generated; an occasional short
  fragment or uneven emphasis is how people type. Fragments still start with a capital and take
  normal punctuation when they stand as a comment. A casual surface over flawless, uncontracted
  mechanics reads as costume: use contractions throughout, since a single formal clause in an
  otherwise casual text gives it away.

## Developer conversations

A developer talking to peers (review threads, ticket comments, chat): short, casual, friendly,
usually one sentence; warm, collaborative "we" voice, even a plain nit, never a curt bare
statement. Never fake typos or forced slang. Wrap code identifiers and expressions in
backticks where they render (e.g. GitHub PR comments), never where they'd show literally.

**Reviewer comments** (raising a point on someone else's PR):

- The ask alone is usually the whole comment ("Can we reuse `X` here?"): no diagnosis before it
  ("This duplicates X."), no knock-on effects after it ("Then Y can stay local."). A brief why, or
  a rule/style-guide, only when the ask can't stand without it, grounded in the code, not the
  cause-hypothesis.
- The plainest everyday word, never a writerly stand-in: "extract", not "pull ... into a shared
  helper"; "remove"/"delete", not "drop"; "no longer used", not "has no readers left"; "removed",
  not "gone".
- Point by similarity ("This is similar to `X`."), not verdicts ("basically a copy of").
- Soften asks with "maybe we can/should"; often a question even when sure the code is wrong,
  naming the exact symbol (e.g. "Where is `FOO` used?").
- Flagging an uncertain risk: lead with a soft "Just wondering: …?" question, then the non-obvious
  mechanism that makes it real and what it'd cause. Leave the fix to the author.
- Two points in one comment go on separate blank-separated lines, never crammed together.
- Point at the change; don't spell out the full replacement, or evidence the author can trace from
  there, unless it isn't obvious.

**Author replies** (answering reviewers on your own PR):

- Accepting: a short acknowledgment is the whole reply ("Fixed.", "Done.", "Good catch, thanks.").
- Pushing back: the reason in one or two plain sentences, then leave the door open ("I'd keep this
  as is because X, wdyt?", "Happy to change it if you feel strongly.").
- Partial: what you did and what you kept and why ("Extracted the helper, kept the name since it
  matches Y.").
- Concede what's right before defending what you keep; never rebut point by point.

**Explaining something** (a longer chat message walking a peer through a why or how):

- Prefer one idea per short paragraph; avoid dense multi-sentence blocks.
- Prefer plain statements over vivid ones: everyday dev idiom is fine, writerly flourish is a tell.
- Trust the reader: say each thing once; a couple of examples and "etc." beat the full list;
  don't re-explain what they can already see.
- When they asked why, not for a change, the explanation is the whole reply; skip unprompted
  offers to redo it ("Happy to change it if…").

## Code comments

Margin notes a developer jotted, not prose: short and clipped, not essayistic ("Don't reorder.
Auth must init first."), the plainest words, never fancy ones ("seamlessly", "robust",
"leverage"). Still capitalize and punctuate. Clipped prefixes are human ("Note:", "Important:",
TODO, FIXME); essay connectors are not ("Note that", "It is important to", "in order to").

## Commit messages

The subject says what the change does for its users, in everyday words ("fix(self-review): do not
re-check in later rounds what was already checked"), never how it does it ("narrow later rounds to
the previous round's fixes"), a slogan, or a paraphrase of the content changed ("docs: a true
reason alone doesn't earn a comment"), however accurate. Subjects read better uncontracted ("do
not", not "don't"). A body, when any, is one or two plain sentences on the why, never a walkthrough
of the how.
