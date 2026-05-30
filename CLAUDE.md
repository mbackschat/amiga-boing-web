# boing-web

A modern, single-page browser tribute to the **Amiga Boing Ball** demo (Dale Luck / RJ Mical, 1984 CES). Specifically a recreation of the **AMICUS Disk 9** variant — a red-and-white spirally-checkered sphere bouncing inside a magenta wireframe room, with a metallic "BOING!" panned to impact side.

## Source of truth

**The overriding goal: this port MUST be as close to AMICUS Disk 9 as possible.** Fidelity to the original beats convenience, "cleaner" code, or visual embellishment. When in doubt, do what the AMICUS source does — its method, its geometry, its values. Deviations are allowed only where the web platform genuinely can't replicate the original (e.g. FFP math, bitplane hardware), and every such deviation must be documented with *why* and calibrated to numbers from the source. Don't add features the original doesn't have, and don't drop ones it does (the offset drop-shadow, the elastic perpetual bounce).

This project is a *port* of the disassembled AMICUS Disk 9 Boing Ball binary. Two layers of source-of-truth:

**Local (in this repo):**
- [`specs/archive/2026-05-23-boing-browser-port.md`](specs/archive/2026-05-23-boing-browser-port.md) — the completed design spec this port implements, with its "Notes from implementation" section filled in.
- [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) — the consolidated technical reference; the only doc you need open while working on the code.
- [`vendor/amiga-boing/docs/BOING-ANALYSIS.md`](vendor/amiga-boing/docs/BOING-ANALYSIS.md), [`vendor/amiga-boing/docs/DEMO-BACKGROUND.md`](vendor/amiga-boing/docs/DEMO-BACKGROUND.md), and [`vendor/amiga-boing/docs/AMIGA-KNOWHOW.md`](vendor/amiga-boing/docs/AMIGA-KNOWHOW.md) — mirrored copies of the upstream analysis docs (per-function source analysis, variant history, hardware/OS reference). Cited inline from `IMPLEMENTATION.md` and the design spec.
- `src/boing.samples` — the raw 8-bit PCM sample, copied from the upstream repo. Inlined into the build by Vite's `?url` import (see [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) §10.1).

**Upstream Amiga repo — vendored as a git submodule at [`vendor/amiga-boing/`](vendor/amiga-boing/):**
- the assembly source `vendor/amiga-boing/src/{boing,main,globe,anim}.s`, the full analysis docs `vendor/amiga-boing/docs/` (incl. `RUNNING.md`, `DEVIATIONS.md`), and the Amiga system includes/structs at the nested submodule `vendor/amiga-boing/vendor/{include,libs,rom}`. Init with `git submodule update --init --recursive`.

`docs/IMPLEMENTATION.md` quotes the relevant assembly anchors and analysis pointers inline; you should not need to open the submodule during normal work on this port.

**Always prefer the original sources.** When the port deviates from the original's look or behaviour — geometry, counts, coordinates, timing, colours, the shadow — read the upstream assembly (`vendor/amiga-boing/src/{globe,main,anim}.s`, with struct/FFP definitions in `vendor/amiga-boing/vendor/include`) and the analysis docs. Do not eyeball screenshots or tune constants by guessing: that oscillates and wastes effort (the wireframe-room counts, the front-hemisphere mesh, and the shadow geometry were all only settled — or mis-settled — by what was read in the `.s` source). The assembly is the final authority.

**NON-NEGOTIABLE: never use visual/screenshot measuring to plan an implementation or a fix.** Implementation and fix decisions — geometry, offsets, sizes, counts, colours, timing — must be **derived from the assembly source** (decode the FFP bit-patterns exactly; trace the coordinate base end-to-end through `_init_globe` / `_draw_globe` / the runtime scroll & blit). Screenshots may only *confirm* that a source-derived implementation looks right after the fact — they must never be the basis for choosing a number. If a value can't be read from the source yet, read more source until it can; do not substitute a pixel measurement. Analysis-doc prose can lag the `.s` — when they conflict, the opcodes win.

## Tech stack

- **TypeScript + Vite** (vanilla-ts template).
- **Canvas2D** for rendering — single 320×200 logical canvas, CSS-scaled 4× with `image-rendering: pixelated`.
- **WebAudio** for sound — dual-channel `AudioBufferSourceNode` with `DelayNode` + `StereoPannerNode` + `GainNode`.
- No framework, no 3D library, no state management library. WebGL / Three.js are explicitly rejected — they cannot produce the four fidelity invariants below.

## Non-negotiable fidelity invariants

These define what makes the demo *Boing*. Lose any one and the result looks generic.

1. **Ball is a static indexed bitmap rasterized once at startup.** Apparent rotation comes from *palette cycling* — slots 2..15 of a 32-entry palette are rewritten every frame. The ball's pixel data is never re-drawn after startup.
2. **Stripe pattern uses the half-cycle-offset formula** `color = ((lat & 1) * 7 + lon) % 14 + 2`. Even bands phase 0, odd bands phase 7. This produces the diagonal spiral. Drop the offset and you get a beach ball.
3. **Rim-darken over the wireframe floor** uses the 5th-bitplane palette-half-toggle: palette slots 0/1 (sky/rim) differ from 16/17 (magenta sky / dark-magenta rim), but ball facet slots 2..15 *mirror* 18..31 every frame so the ball itself looks identical over either background. The dark rim where ball overlaps wireframe is purely a palette effect — no per-pixel re-shading.
4. **Stereo audio uses volume + inter-aural time delay** on two channels — not a single panner. The far-side channel is both quieter *and* delayed by a few milliseconds.

## Starting a new feature or change

Full procedure: [`docs/SPEC-HOW-TO.md`](docs/SPEC-HOW-TO.md). Tight version:

1. **Decide.** Spec-worthy or follow-up-able? Tuning constants, single-file fixes, glyph tweaks, CSS adjustments → no spec. New visual modes, multi-file refactors, audio additions, anything where the wrong architecture is expensive to undo → spec.
2. **Discuss before code.** For anything multi-file or ambiguous, ask for 3 approaches with trade-offs *before* any changes. 5–10 minutes of conversation saves hours of misdirected work.
3. **Implement.** Atomic commits (one logical change each). Read every diff — if it's too big to read in one sitting, the task was too big. Re-steer early when the agent drifts. Blast-radius awareness: leaf-file changes → high autonomy; core modules (`physics.ts`, `audio.ts`, `composite.ts`, `ball.ts`) → file-by-file with checkpoints.
4. **Cross-model review** any non-trivial diff with a different model family before declaring done. Skip for trivial work.
5. **Wrap up.**
   - **Update [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md)** if the change touched anything described there (file layout, interaction model, build pipeline, module responsibilities, palette/composite/physics/audio internals). The doc is the consolidated technical reference — if it goes stale, future readers can't trust it. This is non-negotiable.
   - If a new convention surfaced → add a rule to this CLAUDE.md.
   - If a clean reusable pattern emerged → add it to `references/` (creates the folder on first use).
   - If you wrote a spec → set `Status: completed`, fill "Notes from implementation" (as you went, don't reconstruct), move it to `specs/archive/`.

When working *inside* a not-yet-archived spec file: fill its "Notes from implementation" section as you go. If the spec body itself turns out to be wrong, EDIT it — specs are markdown edits, not phase gates.

**Never retrofit an archived spec.** Once a spec is in `specs/archive/` it's a frozen historical record of *that* change, as completed — do not edit it to reflect later work, re-tune constants, append deviations from subsequent rounds, or "correct" its numbers. Later changes belong in `docs/IMPLEMENTATION.md` (the living technical reference), this `CLAUDE.md` (conventions), or a *new* spec. The only edits to an archived spec are reverting a stray retrofit. If a later change makes an archived spec's numbers stale, that's expected and fine — the spec records history, `IMPLEMENTATION.md` records current truth.

## Coding style

- Minimum code that solves the problem. No speculative abstractions.
- Touch only what's needed. Clean up only your own mess.
- Atomic commits — each step in `docs/IMPLEMENTATION.md`'s implementation order is its own commit.
- Commit messages: subject line only by default; 1-2 body sentences only for non-obvious *why*. No bullet lists, no test counts, no restating the diff.
- No tests. Verification is by eye and ear in the browser, with UAE side-by-side as the gold standard.
- Default to writing no comments. Add one only when the *why* is non-obvious (e.g. the `1.6875 / 1.4375 / 512` projection constants warrant a one-line comment pointing at the shift-and-add origin in `globe.s`).

## Running

```
npm install
npm run dev      # local dev server with HMR
npm run build    # → single self-contained dist/index.html
npm run record   # → docs/demo.mp4 (with sound) + docs/demo.gif (silent)
```

`npm run record` needs both `ffmpeg` and `gifski` (mandatory) on PATH (`brew install ffmpeg gifski`); gifski is the GIF encoder (materially smaller, higher-quality GIFs than ffmpeg's palette path). Recording is fully automated — Playwright drives the scripted sequence (brief overlay → click → 4 s bounce → smooth cursor traverse to title bar → drag → 4 s post-drag). Audio is captured in-page via a WebAudio `MediaStreamDestination` tap so no OS-level audio routing is needed; frames come from a CDP `Page.startScreencast` stream at ~72 fps.

After `npm run build`, `dist/` contains exactly one file: `index.html` (~40 KB) with the JS bundle, CSS, and the boing.samples PCM all inlined. Double-click it to run under `file://` in any modern browser (Safari / Chrome / Firefox / Edge), no server needed. This single-file output is the deliverable; everything else (the `src/` TypeScript, the `node_modules`) is build-time.

No mobile support (renders, but no touch UI).

The demo starts paused with a "CLICK OR PRESS SPACE TO START" overlay rendered in Topaz Double Sans (glyphs traced from amigavision/TopazDouble). The first click/Space starts the bounce *and* resumes the suspended `AudioContext` in the same gesture so the first bounce is audible. Subsequent clicks or Space toggle pause. `f` toggles fullscreen.
