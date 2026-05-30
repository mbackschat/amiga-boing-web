# Workbench split-screen drag-down

**Date:** 2026-05-24
**Status:** completed (2026-05-24)
**Depends on:** completed port spec `specs/archive/2026-05-23-boing-browser-port.md`.

---

## Intent

Add the iconic Amiga screen-drag-down behaviour: the Workbench 1.3 desktop is layered behind the running Boing screen and can be pulled down from the top via its title bar, exposing the desktop in the lower portion while Boing continues running above. The two regions render at different pixel densities — Boing in lo-res (320 wide), Workbench in hi-res (640 wide) — to emulate the Amiga Copper mid-frame resolution switch.

This is a visual tribute, not a functional Workbench. Icons aren't clickable; no window manipulation; no live system. The Boing demo continues to run unaffected behind/above the overlay.

---

## Scope

### In scope

- A static Workbench 1.3 background image overlaid in the bottom portion of the canvas, anchored at a `splitY` boundary.
- A draggable title bar (the top row of the Workbench image) that the user can grab and drag vertically with the mouse / pointer to change `splitY`.
- Mixed-resolution rendering: Workbench pixels are half the size of Boing pixels (hi-res over lo-res), faithful to the Copper effect.
- An Amiga 1.3 mouse pointer (red/orange arrow) tracked to the user's actual mouse position; visible only inside the demo area.
- Initial state: Workbench 1/4 visible at the bottom of the canvas.
- The retouched Workbench image (cursor painted out — see §3.4) shipped inline in the build, the same way `boing.samples` is.

### Out of scope

- A live Workbench — no clickable icons, no window dragging, no `Boing` icon doing anything.
- Multiple stacked Amiga screens. There is exactly one drag-down screen, the Workbench.
- Touch / mobile UX. Desktop pointer events only.
- Saving the user's `splitY` across reloads.
- Re-skinning Boing to render in hi-res or matching Workbench resolution. The two areas stay distinct.

---

## Design

### 3.1 Mixed-resolution rendering — dual-canvas layered overlay

The demo currently uses a single 320×200 canvas, CSS-scaled 4× to 1280×800. Boing's lo-res framebuffer matches the Amiga lo-res.

For Workbench we add a **second DOM element** layered on top of the existing canvas:

- An `<img id="workbench">` positioned absolutely inside the demo wrapper, full-width.
- Native image dimensions: **640×200** (de-interlaced + cropped from the original 640×512 PNG by `specs/workbench/retouch.py`).
- CSS scale: **2× horizontal / 4× vertical** → 1280×800 CSS, the same dimensions as the demo viewport. Pixels are half-wide (the canonical Amiga hi-res non-interlaced look) and the same vertical density as Boing's lo-res. Both `width` and `height` are forced via HTML attributes *and* CSS so the browser never falls back to natural dimensions.
- `image-rendering: pixelated; image-rendering: crisp-edges;` to keep the chunky pixel look.
- **Positioning, not clipping**: the image's `top` is bound to `splitY` from JS. As `splitY` changes, the entire image translates — the title bar at image row 0 always sits at screen Y = `splitY`, with the desktop extending downward. The wrapper's `overflow: hidden` clips whatever runs past the bottom of the visible viewport.

Boing's canvas keeps rendering its 320×200 lo-res framebuffer at 4× CSS scale. Boing is *behind* the Workbench layer in z-order. When `splitY_css` is large (Workbench fully hidden), the Workbench layer's clip rectangle is empty and Boing covers the whole viewport.

Why two DOM layers, not one bigger canvas:

- The existing `composite()` and palette pipeline stay untouched. No invasive rewrite.
- Native resolutions and pixel densities are independent — that's the point.
- Vite's existing bundling story (everything inlines into one HTML) survives unchanged: the PNG inlines as a base64 data URL the same way `boing.samples` does.

#### Rejected alternative: one big canvas at 640×400

Upscale Boing's 320×200 framebuffer 2× into a 640×400 main canvas, then draw Workbench at native resolution in the bottom portion. **Rejected** because it forces a rewrite of the rendering pipeline (composite needs to write 2×2 blocks) for no visible benefit — the dual-DOM approach gives the same pixel densities with no changes to existing code.

### 3.2 The title bar and `splitY` state

`splitY` is the CSS-pixel Y where the *top edge of the Workbench title bar* sits. Coordinates are in the demo's 1280×800 visible frame.

Constants:
- `WB_TITLE_BAR_PX = 10` (hi-res native rows; verify from image when copying — likely 9-10).
- `WB_TITLE_BAR_CSS = WB_TITLE_BAR_PX * 2 = 20` CSS pixels.
- `SPLIT_MIN = 0` (Workbench's title bar at the very top of the viewport; the desktop fills the lower part).
- `SPLIT_MAX = 800 - WB_TITLE_BAR_CSS = 780` (only the title bar peeks at the bottom; Workbench fully hidden otherwise).
- `SPLIT_INITIAL = 600` (Workbench 1/4 visible — the bottom 200 of 800 CSS pixels show Workbench).

### 3.3 Drag mechanic

Pointer events on the title bar region:

```
pointerdown on title bar at CSS Y ∈ [splitY, splitY + WB_TITLE_BAR_CSS]:
  - capture pointer (setPointerCapture)
  - dragOffset = pointerY - splitY
  - drag = true

pointermove (when drag):
  - splitY = clamp(pointerY - dragOffset, SPLIT_MIN, SPLIT_MAX)
  - re-clip the Workbench layer

pointerup / pointercancel:
  - drag = false
  - releasePointerCapture
```

Click *on the title bar* doesn't toggle pause (the existing click-to-pause stays bound to the canvas area only, not the title bar).

### 3.4 Mouse pointer (Amiga 1.3 red arrow)

The original `amiga1wb13.png` includes the mouse pointer near the right side, drawn as part of the screenshot. We need it as a **separate sprite** at the actual user pointer position, so:

1. Trace the cursor bitmap from `amiga1wb13.png` (same approach we used for Topaz Double Sans glyphs in `src/font.ts` — read the PNG with PIL, extract pixels, encode as `Uint8Array`s of bitmap rows + a colour palette).
2. Retouch the original PNG to *remove* the cursor — paint the cursor's pixels over with the surrounding Workbench blue (`#0055AA`-ish). The retouched image is what gets bundled.
3. Ship the cursor as a small JS module `src/cursor.ts` with the bitmap data and a `drawCursor(ctx, x, y)` function, modelled on `src/font.ts`.
4. Hide the native browser cursor over the demo area (CSS `cursor: none` on the canvas wrapper).
5. Draw the Amiga cursor at the user's pointer position whenever the pointer is over the demo, in a third DOM layer (a tiny canvas or absolutely-positioned div).

The cursor is visible over both the Boing and the Workbench portions. (The Amiga screen-drag context shows the pointer everywhere on the screen.)

**Licensing note.** The Amiga 1.3 mouse-pointer bitmap is owned by Cloanto/Hyperion. A traced-from-screenshot version is functionally a reimplementation and matches the precedent we set with Topaz Double Sans (traced from `amigavision/TopazDouble`'s reference PNG). We credit "Amiga 1.3 mouse pointer (traced from a Workbench screenshot)" in README. If you'd rather use an externally-licensed cursor sprite (MIT or PD), point at a source and we'll swap.

### 3.5 Workbench asset pipeline

- Copy `specs/workbench/amiga1wb13.png` to `src/workbench.png`.
- Run a one-off Python retouch script (kept in `specs/workbench/retouch.py` for reproducibility) that loads the PNG, paints the cursor area with surrounding Workbench colors, and writes the result to `src/workbench.png`.
- `audio.ts`-style inlining: `import workbenchUrl from './workbench.png?url'`. With `assetsInlineLimit: 100000` already set, the PNG inlines into the bundle.
- File size impact: `amiga1wb13.png` is `~50 KB` raw PNG. Base64 inflates to ~67 KB. Total `dist/index.html` grows from ~40 KB to ~107 KB. Still trivial.

### 3.6 Module layout

New TypeScript modules:

- `src/workbench.ts` — owns `splitY` state, the `<img>` overlay element setup, pointer-event handlers, the title-bar hit test.
- `src/cursor.ts` — the Amiga cursor bitmap + render function + pointer tracking.

`src/main.ts` calls `initWorkbench()` and `initCursor()` after the existing setup.

---

## Implementation plan

- [ ] **Retouch script.** Write `specs/workbench/retouch.py` (Python + PIL): find cursor by colour-key (red/orange pixels surrounded by Workbench blue), paint over with surrounding blue. Verify the result visually.
- [ ] **Trace cursor.** Extract the cursor's 16×16 bitmap (with colours) from the *original* `amiga1wb13.png` before retouch. Encode into `src/cursor.ts`.
- [ ] **Copy retouched image** to `src/workbench.png`. Verify dimensions still 640×512.
- [ ] **`src/workbench.ts`.** Create the `<img>` overlay, position absolutely, set `image-rendering: pixelated`. Implement `splitY` state with `SPLIT_INITIAL = 600`. Implement pointer-event drag handlers. Apply CSS clip-path or wrapper-overflow to crop to `splitY..viewport_bottom`.
- [ ] **`src/cursor.ts`.** Create the cursor canvas/element. Track `pointermove` on the demo wrapper to update the cursor position. Hide native cursor via CSS.
- [ ] **Wire into `main.ts`.** Call `initWorkbench()` and `initCursor()` after the existing setup; both before `startLoop()`.
- [ ] **`index.html`.** Add the wrapper div + the two overlay elements.
- [ ] **`src/style.css`.** Wrapper positioning; `cursor: none`; `image-rendering: pixelated` on the overlay.
- [ ] **Update `dist/` build verification.** Confirm single-file output is still self-contained (`grep -c data:` should now find 2 — the PCM and the Workbench PNG).
- [ ] **Update docs.** `docs/IMPLEMENTATION.md` gets a new section on the mixed-res overlay + cursor. `README.md` gets a one-line mention in features. `CLAUDE.md` "fidelity invariants" stays unchanged (those are about Boing itself; the Workbench is an additional layer, not a Boing invariant).

---

## References

- `specs/workbench/amiga1splitscreensm.png` — the split-screen visual reference.
- `specs/workbench/amiga1wb13.png` — full Workbench reference, source for the cursor trace.
- `src/boing.samples` — pattern for asset inlining via `?url` import (`audio.ts:5`).
- `src/font.ts` — pattern for hand-encoded bitmap rendering.
- Existing pointer handling on the canvas: `src/main.ts:35-48` (click + Space + F-fullscreen).

---

## Open questions

1. **Pointer constraint at SPLIT_MIN.** Should we allow the user to drag the title bar *all the way* to `y=0` (Workbench fills the screen, Boing hidden)? Or stop at some `SPLIT_MIN > 0` (e.g. 32 CSS pixels, always leave Boing's top 32 px visible)? The Amiga's actual behaviour allowed full overlap. Default: `SPLIT_MIN = 0`.
2. **Pause when Workbench is dragged?** The original Amiga halted nothing — Boing kept rendering behind. Default: keep running. (Matches Q4 "no animation" in our prior discussion — Workbench is the static layer; Boing is the live one.)
3. **Cursor visibility.** Show the Amiga cursor over Boing too (full-screen presence), or only inside the Workbench band? Default: full-screen (you see the pointer over Boing as well, since on Amiga the pointer lives on top of everything).
4. **Where to host the retouch script.** `specs/workbench/retouch.py` keeps it next to the source images and out of `src/`. Alternative: `scripts/retouch-workbench.py`. Default: `specs/workbench/retouch.py`.
5. **What if the cursor trace doesn't end up byte-accurate** to the original because of PNG compression artefacts? Default: trace as faithfully as we can; treat anything within ~2 pixels of the original arrow shape as good enough. The Topaz precedent says this is fine for tributes.

---

## Notes from implementation

Filled during implementation on 2026-05-24.

### Followed exactly

- Two-DOM-layer overlay (`<img id="workbench">` + `<canvas id="cursor">`) layered over the existing canvas inside a `<div id="demo">` wrapper. Existing 320×200 indexed-color pipeline untouched.
- Mixed-resolution rendering: Workbench at 2× CSS scale, Boing at 4× CSS. Pixel densities differ visibly.
- `splitY` state with the §3.2 constants (`SPLIT_MIN = 0`, `SPLIT_MAX = 780`, `SPLIT_INITIAL = 600`). Default opens Workbench 1/4 visible.
- Pointer events on the title bar band drive drag with `setPointerCapture` for off-band tracking.
- Cursor traced from the original screenshot at (582, 250)..(597, 265). 4-color palette (red body, light highlight, black outline, transparent). Hot spot (0, 0) at the top-left tip.
- All open questions resolved as the defaults proposed.

### Deviations / surprises

- **PNG inlined smaller than predicted.** Spec estimated total dist at ~107 KB; actual is **57.9 KB** because `amiga1wb13.png` compresses very efficiently (large blocks of single-color blue) — only 11 KB raw, ~17 KB inflated as base64.
- **The cursor at native 16×16 has paired rows in the source image** (every two image rows are identical). Likely because the screenshot is PAL hi-res non-interlaced rendered at 2× vertical to 640×512. I just used the 16×16 directly; visually identical to the screenshot, and we render it at 2× CSS scale anyway.
- **Click-vs-drag UX needed event-phase care.** The window-level click handler (start/pause from the original port) and the workbench drag handler both want to handle clicks. Resolved with a capture-phase click handler on the wrapper that `stopPropagation`s when the click lands inside the Workbench band (y ≥ splitY). Clicks on the Boing band still bubble up and toggle pause/start. Took ~10 minutes to get right.

### Lessons

- **First pass shipped the screen-drag as `clip-path: inset(splitY)` — wrong.** That clips the *top* of the image; the title bar (image row 0) ended up hidden the moment `splitY > 0`. The Amiga semantics is that the image **moves** with the drag — the title bar lives at screen Y = `splitY` and the whole desktop translates down with it. Fixed by setting `top: splitY` on the image and dropping the clip-path. The spec wording above was self-inconsistent (it said "title bar at Y = splitY" *and* "clip-path inset splitY"); §3.1 rewritten post-hoc so future readers don't repeat the mistake.
- **Forcing image dimensions twice** (HTML `width`/`height` attributes *and* CSS `width`/`height`) avoided a separate "image shows at native 640×512" failure mode on first run.
- **`pointer-events: none` on the cursor element** is essential — without it the cursor sprite intercepts mouse events meant for the workbench/canvas below.
- **`cursor: none` on the wrapper** hides the native cursor cleanly; the Amiga sprite takes over visually.
- **Iterated three times to get the layout right.** First pass: image at 1280×1024 CSS — 224 CSS px taller than the 800 viewport, so the bottom of the desktop was permanently invisible. Second pass: de-interlaced PNG to 640×256 + rendered at 1280×512 inside a 1280×800 blue-background container — fit the viewport but pixels were square (2×:2×), which **made the icons look squashed vertically** because the canonical Amiga hi-res non-interlaced look has half-wide pixels (2×:4×). Third pass (shipped): de-interlace + crop to **640×200** (NTSC hi-res non-interlaced dimensions) + render at 1280×800 CSS (2×:4×) — pixels at the correct half-wide aspect, full content visible at `splitY = 0`, no padding container needed. Lost content: the bottom of the Prefs window (5 icons). Trade acceptable for a tribute demo.
- **`display: flex` + `transform: scale` don't co-operate the way you'd expect.** First attempt put `#demo` in a flex-centered body with `transform: scale(...)` from JS — the layout box stayed 1280×800 in flex's view and got clipped by the body's `overflow: hidden`, regardless of how small the visible transform was. Reported as "50+ px missing on width" then "32 px missing" after one half-fix. Fixed by switching `#demo` to `position: fixed` with `transform-origin: top left`; JS now computes `left`, `top`, *and* `scale` from `innerWidth/innerHeight`. The transformed wrapper sits exactly inside the viewport with no layout-box mismatch. Pointer-event coordinates in `workbench.ts` and `cursor.ts` divide out the current scale (`rect.height / wrapper.offsetHeight`) to convert viewport coords back to wrapper-local.
- **Click-suppression on the workbench band blocked the first-click-to-start.** Initial draft `stopPropagation`'d every click landing in the workbench band so the window-level `interact()` (which starts the demo and resumes the suspended `AudioContext`) wouldn't fire on title-bar clicks. But when the user dragged the workbench up to cover Boing, *every* click was in the workbench band, so the demo never started — reported as "sound is not playing." Fixed by tracking a `didDrag` flag from `pointermove`: only suppress the click if there was movement during the gesture. A bare click on the title bar (no movement) bubbles through normally, starts the demo, and resumes audio — same as clicks on Boing.
