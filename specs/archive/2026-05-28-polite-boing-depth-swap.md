# Polite-Boing depth-swap (screen Z-order)

**Date:** 2026-05-28
**Status:** completed
**Depends on:** completed `specs/archive/2026-05-24-workbench-split-screen.md` (drag-down + mixed-resolution overlay + cursor).

---

## Intent

Today the Workbench overlay is always-in-front: the user can drag it down to expose Boing, but can never bring Boing fully forward. Real Amiga Intuition lets the user click a depth gadget on the title bar to swap screen Z-order — the "polite" Boing's signature interaction. Add that swap, with a faithful Amiga-style affordance for going back (no chrome on the Boing screen, but a phantom depth-gadget hit box at the canonical position), plus keyboard shortcuts for discoverability.

The shipped product after this spec: every visible part of the 1984 viewing experience is reachable. Drag the Workbench down to peek (already shipped). Click the depth gadget to bring Boing fully forward (new). Click in the corresponding "phantom" position on the Boing canvas — or press Esc/Tab — to send it back.

---

## Scope

### In scope

- Two named states for the screen stack: **State A** (Workbench in front, current behaviour) and **State B** (Boing in front, Workbench hidden).
- Click the "send-to-back" depth gadget in the Workbench title bar → enter State B.
- Click the **phantom hit box** at the top-right of the Boing canvas (same coordinates the WB send-to-back gadget would occupy if WB were at `splitY = 0`) → return to State A.
- Keyboard shortcuts: `Tab` toggles A↔B; `Esc` returns from B to A. No-op in inapplicable state.
- A 2-second ghosted hint on entering State B (`Esc · Tab · top-right corner → back to Workbench`), then fades out. Only in-demo discoverability for the State B return.
- Boing physics / palette / audio keep running across both states with no perceptible glitch on swap.
- Page first paint stays in State A with the existing `SPLIT_INITIAL = 600` (Workbench occupies bottom 25%).

### Out of scope

- Animation between states (no slide / fade / morph). Snap A↔B instantly.
- Persisting state across reloads.
- Touch / mobile depth-gadget UX. The phantom hit box still works on touch (tap), but no tap-target-size adjustments.
- Showing a visible title bar on Boing in State B — explicitly *not* done. Authentic to the original BORDERLESS+BACKDROP window covering the screen title bar.
- A second depth gadget for "bring-to-front" on the WB title bar. The image has both icons drawn (visible at the right end of the title bar), but only the right-side "send-to-back" one is wired. The left "bring-to-front" gadget is decorative in State A — WB is already in front, so it's a no-op — and we don't expose any other affordance for it. Matches the Amiga's behaviour: clicking bring-to-front when already in front does nothing.
- Updating the existing drag-down behaviour. Drag still works in State A; drag is unreachable in State B (WB is hidden). Nothing to change.

---

## Design

### 3.1 State model

Single boolean: `boingForward: boolean`. Default `false` (= State A). Owned in `src/workbench.ts` (or a new module if it grows; for now extend `workbench.ts`).

| State | `boingForward` | DOM effect | What user sees |
|---|---|---|---|
| A | `false` | WB `<img>` visible, drag enabled, `splitY` ∈ [0, 780] | Workbench at bottom (default `splitY = 600`), draggable, Boing visible above |
| B | `true` | WB `<img>` hidden (`display: none`), drag effectively disabled | Full 320×200 Boing canvas, no chrome, no WB |

When entering State A from State B: WB returns to whatever `splitY` it had when it was last visible (it's not reset). The intent is "same screen you left."

Boing animation runs the same in both states; nothing about the canvas / `composite()` / `startLoop()` pipeline changes.

### 3.2 The WB depth-gadget hit box (State A → State B)

In the source `src/workbench.png` (640×200 native), the title bar has two depth-gadget icons drawn at the right end. From inspection (image read in this session, gadgets visible at the right edge of row 0..9):

- **Right gadget (send-to-back)**: native x ≈ `614..637`, y ≈ `1..8` — roughly 24×8 native pixels.
- **Left gadget (bring-to-front)**: native x ≈ `590..613`, y ≈ `1..8` — same size, immediately left.

At 2× horizontal / 4× vertical CSS scale (the existing transform), the wrapper-local hit box for the right gadget is:

```
WB_GADGET_BACK_X     = 614 * 2 = 1228     // CSS x, wrapper-local
WB_GADGET_BACK_W     = (637 - 614 + 1) * 2 = 48   // CSS width
WB_GADGET_BACK_Y_REL = 1 * 4 = 4          // CSS y relative to WB title bar top
WB_GADGET_BACK_H     = (8 - 1 + 1) * 4 = 32   // CSS height
```

The hit box translates with the WB layer: actual wrapper-local Y range is `[splitY + WB_GADGET_BACK_Y_REL, splitY + WB_GADGET_BACK_Y_REL + WB_GADGET_BACK_H]`.

The exact native pixel ranges should be measured by an implementer against `src/workbench.png` and adjusted by ±2 pixels if needed — we don't need pixel-perfect to the screenshot, just "the user's click on the gadget icon hits it." Generous (rounded-out) hit boxes are fine; tight ones break on the slightly-imperfect bitmap.

A `pointerdown` inside this hit box:

- **Suppresses** the title-bar drag (a click on a gadget is not a drag handle).
- On `pointerup` inside the same hit box (a "click", not a drag): set `boingForward = true`, hide WB.

If `pointerup` fires outside the hit box, it's a cancelled click — do nothing. (Matches Workbench UI gadget semantics.)

### 3.3 The Boing phantom hit box (State B → State A)

Same wrapper-local coordinates as the WB send-to-back gadget would occupy if WB were at the top of the viewport (`splitY = 0`):

```
PHANTOM_X = WB_GADGET_BACK_X            // 1228
PHANTOM_W = WB_GADGET_BACK_W            // 48
PHANTOM_Y = WB_GADGET_BACK_Y_REL        // 4
PHANTOM_H = WB_GADGET_BACK_H            // 32
```

i.e. a 48×32 CSS rectangle at the top-right of the wrapper.

- Visible only as a slightly larger pointer-cursor target (no painted UI). It's discoverable by mouse-over (cursor doesn't change — see §3.6 below) or by following the 2-second hint.
- A `pointerdown`+`pointerup` cycle inside this box, while in State B: set `boingForward = false`, show WB.

### 3.4 Keyboard shortcuts

In `src/main.ts`'s existing `keydown` listener:

- `Tab` (anywhere on page): toggle `boingForward`. **Always** prevent default — `Tab` would otherwise move focus and shift the entire page in some browsers. The demo has no other tab-focusable elements; nothing valuable is lost by preventing.
- `Escape`: if `boingForward`, set `boingForward = false`. Otherwise no-op.

Don't bind these to the wrapper; bind to `window`. Tab during a focused address bar etc. is already handled by the browser.

### 3.5 The 2-second hint

When transitioning **into** State B (and only then — never on re-entry to A; never on first load), show a small ghosted text element at bottom-center of the demo wrapper:

```
Esc · Tab · top-right corner → back to Workbench
```

- DOM: a single `<div id="hint">` inside `#demo`, absolutely positioned at `bottom: 24px; left: 50%; transform: translateX(-50%);`.
- Font: the existing Topaz Double Sans from `src/font.ts` would be on-brand; a generic system monospace at 14 CSS px is also acceptable for a first cut. Implementer's call — start with the simpler one and upgrade if it looks wrong.
- Colour: white text with a subtle black shadow (`text-shadow: 0 1px 2px rgba(0,0,0,0.6)`), or a 70%-opaque dark background pill. The point is "readable against any Boing pixel."
- Animation: `opacity: 1` on entry, then CSS-transition to `opacity: 0` over `1500ms` with a `500ms` delay, total visible time ~2s. Re-set `opacity: 1` and re-trigger on each subsequent A→B if the user toggles back and forth.
- `pointer-events: none` so the hint never intercepts clicks (especially clicks in the phantom hit box, which sits at the *top* of the wrapper — different region but still: defensive).

### 3.6 Cursor behaviour

Today `src/cursor.ts` draws the Amiga 1.3 red arrow over the wrapper at the actual pointer position. It applies in both states without change.

- In State A over the WB title-bar drag region, the cursor stays as the Amiga arrow (it's already the Amiga arrow everywhere over the wrapper). On real Amiga the cursor *would* change to a screen-drag cursor over the title bar; we don't replicate that — the existing single-cursor model is fine.
- Over the WB depth-gadget hit box (State A) and the Boing phantom hit box (State B): still the Amiga arrow. No special cursor for "this is clickable" — matches Amiga.

### 3.7 Module touch points

- **`src/workbench.ts`** — add `boingForward` state, depth-gadget hit-test in the existing pointer handlers, exported `toggleState()` / `setBoingForward(b)` functions for the keyboard handler to call. Hide/show the `<img>` via a class or `style.display`.
- **`src/main.ts`** — add `Tab` and `Esc` handlers calling `toggleState()` / `setBoingForward(false)`. Add the hint show/hide logic, or push that into `workbench.ts` and call it as a side-effect of the setter.
- **`index.html`** — add the `<div id="hint">` element inside `#demo`.
- **`src/style.css`** — styles for `#hint`, the opacity transition, and `#workbench.hidden { display: none }` (or equivalent).

No new TypeScript modules. No changes to `composite.ts`, `palette.ts`, `physics.ts`, `audio.ts`, `ball.ts`, `room.ts`, `font.ts`, `cursor.ts`, `loop.ts`.

---

## Implementation plan

- [ ] **State + setter in workbench.ts.** Add `boingForward` boolean, `setBoingForward(b)` function. When `true`: hide `<img id="workbench">`. When `false`: show. Drag is naturally inert when the image is hidden (the title bar's screen Y range is unreachable).
- [ ] **WB depth-gadget hit test (§3.2).** In the existing `pointerdown` handler, check `WB_GADGET_BACK_*` first. If hit: capture a "gadget press" flag (don't start drag). On matching `pointerup` in the same hit box: call `setBoingForward(true)`. If `pointerup` lands outside, discard the press.
- [ ] **Phantom hit box (§3.3).** Add a sibling `pointerdown`+`pointerup` check when `boingForward === true`: if the click is inside `PHANTOM_*`, call `setBoingForward(false)`. Run this before (or instead of) the existing "click anywhere toggles pause" handler in State B — the phantom click must not also toggle pause.
- [ ] **Keyboard shortcuts (§3.4).** Add `Tab` (prevent default, toggle) and `Escape` (return to A if in B) to `main.ts`'s `keydown`.
- [ ] **Ghosted hint (§3.5).** Add `<div id="hint">` to `index.html`. Style with the bottom-center positioning + opacity transition in `style.css`. From the setter, when transitioning to State B, force `opacity: 1; transition: none;` then on the next frame restore the transition + set `opacity: 0`. On A entry from B, hide immediately.
- [ ] **Verify (§ Acceptance).** Walk the acceptance checklist below in a browser.
- [ ] **Docs.** New section in `docs/IMPLEMENTATION.md`: "State A / State B screen Z-order" describing the model, hit-box coords, keyboard. `README.md` gets an updated interaction line: drag-down + click gadget + Esc/Tab.

---

## Acceptance

Manual checks in a desktop browser at default 1280×800:

1. First load: State A. Workbench bottom 25%, Boing top 75%. Click anywhere on Boing → demo starts; audio plays on first bounce. (Existing behaviour, not regressed.)
2. Drag the Workbench title bar around. Still works; clamped to `[0, 780]`. (Not regressed.)
3. Hover over the two icons at the right end of the WB title bar. Click the right one (send-to-back). WB disappears. Full Boing canvas visible. Ghosted hint appears at the bottom centre and fades out over ~2s.
4. In State B: click somewhere in the middle of Boing. Demo pauses / resumes (existing behaviour, not regressed). WB stays hidden.
5. In State B: click in the top-right corner of the canvas (~48×32 CSS px). WB reappears at its previous `splitY` (e.g. 600 if you hadn't dragged it). No hint.
6. Press `Tab` in State A → enter State B (hint shows). Press `Tab` again → return to State A (no hint).
7. Press `Esc` in State A → no effect. Press `Esc` in State B → return to State A.
8. Ball keeps bouncing audibly across every transition. No re-rasterisation flash. No audio click on swap.
9. Toggle states ~5 times in a row, then drag the WB title bar. `splitY` is preserved (the WB returns to where you last left it, not to `SPLIT_INITIAL`).

---

## References

- `specs/archive/2026-05-24-workbench-split-screen.md` — the layer it builds on.
- `src/workbench.ts` — current state + drag handler. The pointerdown/move/up flow is the integration point.
- `src/workbench.png` — source of the depth-gadget coordinates. Measure here if §3.2's numbers are off.
- `src/main.ts:86-94` — existing `keydown` handler (Space + F). Add Tab + Esc here.
- `src/cursor.ts` — unchanged; reference for "additional DOM layer over the canvas" pattern if the hint grows into something fancier.

---

## Open questions

1. **Hint copy.** Current proposal: `Esc · Tab · top-right corner → back to Workbench`. Alternatives: `Press Esc to return to Workbench` (shorter; doesn't teach Tab or the corner click), `← back to Workbench` (icon-only; not discoverable). Default: the long one — discoverability beats brevity for a 2-second hint.
    - ==> TBD

2. **`Tab` capture aggressiveness.** Preventing default on Tab kills the only browser-native focus mechanism on the page. Acceptable since the demo has nothing else to focus. Alternative: only intercept Tab when an explicit `data-demo-focused` flag is set after the first interaction. Default: always intercept; simpler and we control the whole page.
    - ==> TBD

3. **Phantom hit-box size on small viewports.** At default 1280×800 the hit box is 48×32 CSS px. On a 640×400 viewport (the fit-to-viewport scaler kicks in at <1280 wide) it's 24×16 — small. Should we enforce a CSS-min hit area? Default: no — keep it geometrically tied to the WB gadget position so the affordance feels symmetric; users on small viewports use Esc/Tab.
    - ==> TBD

4. **Hint shows on Tab-into-B but not on Esc-out / Tab-out.** Should the hint also show when transitioning B→A (e.g. teaching "drag the title bar")? Default: no — the WB title bar is visually obvious in State A; nothing needs surfacing.
    - ==> TBD

---

## Notes from implementation

- **Spec coordinates landed without adjustment.** The `WB_GADGET_BACK_*` constants from §3.2 (1228 / 48 / 4 / 32 CSS px) hit the visible right-hand gadget cleanly in the dev server; no ±2-pixel widening needed. Generous-by-one is already baked in via the inclusive `(637 - 614 + 1)` / `(8 - 1 + 1)` width math, so I kept it.

- **Renamed `didDrag` → `suppressNextClick`.** The prior single flag served one purpose — kill the post-drag click before it reached the window-level pause toggle. With two more sources of suppressed clicks (the resolved gadget press and the resolved phantom press), the old name became misleading and `suppressNextClick` reads correctly for all three callsites. The semantics are unchanged.

- **Drag guard turned out unnecessary in State B.** I worried that a pointerdown landing inside the title-bar Y range would still set `dragging = true` while WB was hidden, then re-position `splitY` on pointermove. In practice, the State B branch returns early before reaching the drag start, so the drag is unreachable as the spec predicted. No extra guard added.

- **Hint font: system monospace.** `src/font.ts` only ships glyphs for the 12 start-overlay characters; the hint copy needs lowercase, punctuation, and the `→` arrow — none of which are encoded. The spec called this out as the implementer's choice; I went with `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` at 14 px. A future pass that wanted on-brand Topaz would need to extend `font.ts` *and* push the hint through the Canvas2D framebuffer instead of a DOM element.

- **Hint re-trigger via rAF.** The `transition: none → opacity: 1 → rAF → transition: '' → opacity: 0` pattern reliably re-runs the fade on every A→B. The animation frame is necessary — chaining the property writes synchronously gets coalesced and the transition only fires once.

- **Verification: scripted Playwright walk, 10/10 acceptance checks pass at 1280×800.** I wrote a throwaway `scripts/verify-depth-swap.ts` to drive the dev server through every check in §Acceptance — easier than nine rounds of point-and-click. Deleted before commit per the "no tests" project policy; the source-of-truth is still eye-and-ear in a real browser, and the spec's checklist is reproducible by hand.

- **Side-discovery: pre-existing ball-size + floor-Y bug.** Once the user could see the full Boing scene without the Workbench overlay (via the new depth-swap), it became obvious that the ball at lowest slammed the canvas bottom and the ball itself was visibly oversized vs the original. Root cause is in the original port, not this spec: `PROJ_SCALE = 0.5` was an empirical "tune until ~140 wide" choice in `src/ball.ts`, and `FLOOR_SCREEN = 170` was the AMICUS *buffer-Y* value used as a *screen-Y* value, missing the same -16 viewport-offset shift that `ROOM_Y_OFFSET` applies in `src/room.ts`. Fixed in the same commit as this spec: `PROJ_SCALE: 0.5 → 0.36`, `FLOOR_SCREEN: 170 → 155`. The 155 value (ball-bottom lands on the front-floor-edge line at Y=199, matching user-supplied "ball at impact" reference) supersedes a first-pass `137` that incorrectly trusted a YouTube grab where the ball was caught mid-arc rather than at floor impact. Logged on `specs/archive/2026-05-23-boing-browser-port.md` §4.3 / §6.1 too. *Lesson: visual deviations that hide behind an overlapping layer can persist for months — exposing the canvas exposed two of them in one snapshot.*

- **Floor-impact dynamics rewritten: snap-to-floor + fixed `BOUNCE_VY`.** With `FLOOR_SCREEN = 155` and the original mirror-reflection (`y = 2·FLOOR − y`, `vy = −vy`), the rendered ball never visibly touches the floor — discrete 60Hz time overshoots FLOOR by ~5 px each cycle, and reflection lands the ball 4 px above where it started. Switching to snap (`y = FLOOR`) put the ball on the floor but bled energy: the 0.5·g² semi-implicit Euler integration loss accumulates each frame (no overshoot-gain to compensate), and the apex dropped 4–9 px per cycle — within 10 bounces the ball stopped. Final shape: snap-to-floor *and* reset `vy` to a fixed magnitude `BOUNCE_VY = √(2·g·(FLOOR − APEX_Y))` ≈ 9.165 each impact. Every cycle then has identical energy by construction; verified stable for 30 s (1800 frames, ~40 real cycles) in headless Playwright with `max(ball.y) === 155.00` and `min(ball.y) === 54.57` constant across all cycles. Apex stabilises at 54.57 (4.6 px below initial `APEX_Y = 50`) — that's the discrete-time integration drift in the rising leg, a one-time transient on cycle 1 only.

- **Wrapper height: 800 → 920 CSS so the WB title bar doesn't overlap the floor.** Originally `#demo` was 1280×800 = same size as the Boing canvas. With `splitY = SPLIT_MAX = 760`, the WB title bar at viewport y=760..800 covered native rows 190..200 of the canvas — including the front-floor edge and the ball at impact. User wanted the WB title bar to land *below* the canvas at maximum drag-down, with 2× WB-header-height gap (80 CSS px) between floor and header. Solved by extending the wrapper to 1280×920 with `background: #aaaaaa` (the sky color, so the strip below the canvas blends with the canvas's sky). New `SPLIT_MAX = 880`; at max drag the gap floor → WB-header is `880 − 796 = 84 CSS px` ≈ 2.1× header. The Boing canvas itself is unchanged (still 1280×800 at top:0). `fitToViewport()` updated to scale against the new 920-tall wrapper.

- **WB image extended 640×200 → 640×256 to fill the taller wrapper.** Symmetric problem to the wrapper extension above: with the wrapper at 920 CSS but the WB image still 1280×800 CSS, dragging the title bar all the way *up* (splitY → 0) left a 120-CSS-px sky strip below the image — visible Boing sky bleeding through what should be Workbench. Fixed by relaxing `retouch.py`'s crop (it dropped the bottom of the Prefs window for no good reason — the original 640×512 PAL interlaced source de-interlaces cleanly to 640×256). The image is now 640×256 native = 1280×1024 CSS, taller than the 920-CSS wrapper. The bottom 104 CSS px clip past `overflow: hidden` and the visible WB area is always real Workbench content. Bonus: the Prefs window's full set of icons (Pointer, Printer, Serial, CopyPrefs) is now reachable by drag.

- **Open questions resolved with the spec's stated defaults.**
  1. **Hint copy:** long form `Esc · Tab · top-right corner → back to Workbench` — discoverability beats brevity.
  2. **Tab capture:** unconditional `preventDefault()` — nothing else on the page wants focus.
  3. **Hit box on small viewports:** no min-size override; the geometric symmetry with the WB gadget is the point, and `Esc` / `Tab` cover the cases where 24×16 CSS px is too small to hit.
  4. **Hint on B→A:** not shown — the visible WB title bar in State A is self-explanatory.
