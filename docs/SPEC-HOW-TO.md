# SPEC-HOW-TO

How to start any new feature or change in `boing-web/`. Distilled from [`agentic-engineering-personal-guide.md`](agentic-engineering-personal-guide.md) (§5, §7, §8, §15, §16) into a procedure you can run from the top. Section numbers throughout point back at the full guide for the *why*.

The five-step loop:

```
Decide → Discuss → Implement (re-steer when drifting) → Cross-model review → Wrap up
```

---

## 1. Decide: does this change need a spec?

**The heuristic** (§5.1): *If you'd be annoyed by the agent interpreting your requirements differently than you meant, write a spec. If you could fix it with one follow-up prompt, skip the spec.*

### Skip the spec — go straight to implementation

Concrete examples in this project:

- Tuning a constant: `GRAVITY`, `PROJ_SCALE`, `ROT_FRAMES_PER_STEP`, `MAX_DELAY_SEC`, the start-overlay X/Y positions.
- Fixing a glyph in `src/font.ts`.
- A bug fix isolated to one file (e.g. the stereo pan-sign inversion was a one-file fix).
- A CSS tweak in `src/style.css`.
- Adding a single `console.log` or measurement readout.
- Any change you can fully verify in one read of the diff.

### Write a spec

- A new visual feature: an alternative ball texture, a different demo mode, a "two balls" variant.
- An audio addition: music, more impact types, a procedurally-generated boing.
- A refactor that touches 4+ files (e.g. switching from Canvas2D `putImageData` to WebGL).
- Anything where you'd want to remember *why* later, or where the wrong architecture is expensive to undo.

### Don't write a spec yet — explore first

(§16.1: *"When you don't yet know what you want, writing a spec ossifies the wrong commitment."*)

- "What if the ball had a chrome texture?" — Prototype first. Spec only if it's worth keeping.
- "Could the demo respond to microphone input?" — Talk through it with the agent before any architecture commitment.

---

## 2. Discuss before any code changes

For anything not-tiny, open with a discussion prompt:

> *"Let's discuss [the change]. Don't change any code yet — give me 3 approaches with trade-offs."*

5–10 minutes of conversation. Ask follow-ups. Settle on the approach. *Then* either write the spec or implement.

This is the single most-effective discipline (§5.4). Most agentic-coding failures come from the agent going 30+ minutes in the wrong direction. The discussion costs zero code changes.

Trigger phrases that work reliably:
- *"Let's discuss before changing code."*
- *"Give me three options."*
- *"What would you do differently?"*
- *"Don't implement yet."*

---

## 3. Spec format — pick the size that fits

### Small spec (most cases)

Lives in the chat prompt itself or a throwaway `.md` file. 10–30 lines. Template (§17.4):

```markdown
## Feature: [name]

### Why
[1–3 sentences on the problem and motivation]

### Acceptance criteria
- [observable behavior 1]
- [observable behavior 2]

### References
- [existing code/patterns to mirror, with file paths]

### Non-goals
- [scope you're explicitly excluding]
```

Hand it to the agent. Don't expand the template — 20 lines is the right size for most features.

### Large spec (rare here)

Lives at `specs/YYYY-MM-DD-feature-name.md` in this repo. Uses the §17.5 template (Intent, Scope, Design + rejected alternatives, Data model changes, Implementation plan, References, Open questions, **Notes from implementation**).

The **"Notes from implementation"** section is the most important. Fill it **as you go** with:
- Surprises (things the spec didn't anticipate).
- Deviations (where the implementation diverged from the spec, and why).
- Lessons (what you'd write differently if specifying this again).

The original port's spec has a worked example at [`specs/archive/2026-05-23-boing-browser-port.md`](../specs/archive/2026-05-23-boing-browser-port.md) — see its Notes section.

**Important:** if the spec body itself turns out to be wrong (a misread of the source material, an outdated assumption), **edit the spec** — don't just append a note in the Notes section. Specs are markdown edits, not phase gates (§5.5).

---

## 4. Implementation loop

The cycle (§8.1):

```
Discuss → Plan → Implement → Verify → Reflect → Update context → Repeat
                    ↑                                |
                    └────────── Re-steer ────────────┘
```

### Re-steer when the agent drifts

Trigger phrases (§8.2):

- *"Stop. What's the status? What are you about to do?"* — pause without losing context.
- *"Wait — that's not what I meant. Show me the diff so far and explain what you've done."* — forces a checkpoint.
- *"Back out the last two changes. We were going in the wrong direction. Instead, [new direction]."* — selective rollback.

Cost of stopping the agent: near zero. Cost of letting a wrong direction continue: every subsequent change builds on the wrong foundation.

### Blast-radius awareness (§8.3)

- **Leaf-file change** (e.g. `src/style.css`, `src/font.ts`): high autonomy — let the agent run, review at the end.
- **Single subsystem** (e.g. just the audio path: `src/audio.ts`): moderate autonomy — checkpoint at the end of each conceptual step.
- **Core modules** (`physics.ts`, `audio.ts`, `composite.ts`, `ball.ts`): low autonomy — file-by-file with explicit confirmation. These are the load-bearing fidelity invariants of the demo.
- **Cross-cutting refactor** (rename across all files, framework upgrade): very low autonomy — small batches with checkpoints.

### Atomic commits

One logical change per commit. The agent should commit incrementally as it works, not dump four hours into one commit. Already in CLAUDE.md under "Coding style".

### Read every diff (§7.4, §13.1)

The non-negotiable habit. If a diff is too large to read carefully in one sitting, the task was too big — break it up. The cognitive-debt failure mode is shipping code you never read.

A useful self-test: pick a random file the agent modified yesterday. Can you explain what it does and why, without re-reading? If no, slow down.

---

## 5. Cross-model review for non-trivial work

For anything you weren't 100% confident about, paste spec + diff into a *different model family* (§6):

> *"Here is the spec I gave Claude and the diff it produced. Without making any changes, identify:
> 1. Anything in the diff that doesn't match the spec.
> 2. Anything you would have done differently and why.
> 3. Any edge cases the spec didn't cover that the implementation will fail on."*

If you implemented with Claude, review with GPT or Gemini. Most of the response is noise. The 10-20% that's real is worth more than the 5 minutes.

**Skip for trivial changes** (§16.3) — the overhead exceeds the value.

**Use for**: anything touching `audio.ts`, anything visual (the implementer agent can't see the result), anything that took 3+ iterations to get right.

---

## 6. Wrap-up — three small actions per feature (§15.2)

Always, regardless of feature size:

### 6.1. Touched anything in `IMPLEMENTATION.md`? → update it

This is the consolidated technical reference. If the change altered the file layout, interaction model, build pipeline, module responsibilities, or any of the palette/composite/physics/audio internals it describes, update the relevant section *before* moving on. Drift here defeats the doc's purpose.

### 6.2. New convention surfaced? → rule to CLAUDE.md

Example: after fixing the stereo pan-inversion bug, a rule like *"audio sign-convention reviews require an ear test, not just code review"* could have been added to `CLAUDE.md`.

The growth pattern (§3.3): when the agent makes the same kind of mistake twice, add a rule. Lean is good (§3.3 again) — when a rule becomes obsolete because a model upgrade made it redundant, delete it.

### 6.3. Clean reusable pattern emerged? → `references/`

We don't have a `references/` folder yet. Per §4 of the agentic guide, this is "the highest-leverage move you can make" but only meaningful when patterns repeat. Reasonable seeds *if* a future change touches them:

- `references/scanline-filler/` — direct-Uint8Array polygon rasterization (currently in `src/ball.ts`).
- `references/dual-channel-audio/` — lead + delayed-follow stereo with sign-flipped pan (currently in `src/audio.ts`).
- `references/pixel-bitmap-font/` — `fillRect`-per-lit-pixel font rendering (currently in `src/font.ts`).

First reference creates the folder. Add a `references/README.md` index per §17.2 of the agentic guide.

### 6.4. Wrote a spec? → archive it

For the spec file (`specs/YYYY-MM-DD-feature-name.md`):
1. Set the header to `Status: completed (YYYY-MM-DD)`.
2. Finalize the "Notes from implementation" section (you've been filling as you went — now polish).
3. Move the file from `specs/` to `specs/archive/`.

This is the durable record of *why* the codebase looks the way it does (§5.3). Six months from now you'll thank yourself.

---

## 7. Weekly housekeeping (§15.1)

15–20 minutes when you remember (Friday afternoon is the guide's suggestion):

- Read `CLAUDE.md` top to bottom. Delete obsolete rules. Clarify unclear ones.
- Glance at `references/` (when it exists). Anything stale? Any pattern that was canonical three months ago but has since been refactored?
- Glance at `specs/archive/`. Anything you'd want to reference next time?

Prevents the slow drift that kills these systems.

---

## Common failure modes (§18)

A few patterns to recognize:

- **Agent invents APIs that don't exist.** Pin versions in CLAUDE.md; tell the agent to read `node_modules/[pkg]/dist/index.d.ts` when in doubt.
- **Agent refactors code you didn't ask it to touch.** Stop, revert the unrelated changes, add a rule: *"Stay strictly within the scope of the current task."*
- **Agent silently introduces a forbidden pattern.** Strengthen the CLAUDE.md prohibition with the word *NEVER*. Add a lint rule if the violation repeats.
- **Agent enters a doom loop** (30+ minutes retrying the same approach). Stop the session. Read the actual problem yourself for 5 minutes. Reframe the prompt with the actual constraint.
- **Agent's confidence exceeds correctness** (reports tests pass, real-world doesn't work). Run the feature manually. This is exactly what surfaced the stereo pan bug in this project.

---

## Quick links

- The full guide: [`agentic-engineering-personal-guide.md`](agentic-engineering-personal-guide.md)
- Spec template (small): [`agentic-engineering-personal-guide.md`](agentic-engineering-personal-guide.md) §17.4
- Spec template (large): [`agentic-engineering-personal-guide.md`](agentic-engineering-personal-guide.md) §17.5
- References template: [`agentic-engineering-personal-guide.md`](agentic-engineering-personal-guide.md) §17.2-§17.3
- Example completed spec: [`../specs/archive/2026-05-23-boing-browser-port.md`](../specs/archive/2026-05-23-boing-browser-port.md)
