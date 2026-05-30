# Implementation Reference — boing-web

The complete technical specification for this port, distilled from the design spec at `specs/archive/2026-05-23-boing-browser-port.md` and the disassembly analysis at [`vendor/amiga-boing/docs/BOING-ANALYSIS.md`](../vendor/amiga-boing/docs/BOING-ANALYSIS.md). The order below is the implementation order — each section corresponds to one or two commits in `git log`.

> **Note on paths.** This document uses two kinds of file references:
> - **Local** to this project: `src/...`, `docs/...`, `specs/archive/2026-05-23-boing-browser-port.md` (the completed design spec), and the analysis markdowns mirrored under [`vendor/amiga-boing/docs/`](../vendor/amiga-boing/docs/) (`BOING-ANALYSIS.md`, `DEMO-BACKGROUND.md`, `AMIGA-KNOWHOW.md`).
> - **Upstream Amiga repo** (vendored as a submodule at `vendor/amiga-boing/`): bare references like `src/main.s`, `uae/`, `boing.samples` mean `vendor/amiga-boing/src/main.s` etc. These are the assembly source the port was derived from.
>
> Anywhere a section reference points to `.s` files by bare name, it's the submodule (`vendor/amiga-boing/src/`). Analysis-markdown references resolve to `vendor/amiga-boing/docs/`.

---

## 1. Architecture overview

A single `requestAnimationFrame` loop. Every frame:

```
1. Physics step          — integrate position, detect impacts, set impact flags
2. Palette cycling step  — rewrite slots 2..15 (mirror to 18..31), place pink highlight
3. Composite             — pixel walk: ballBuf + bgBuf + ball offset → palette index → RGBA
4. Blit                  — ctx.putImageData(imageData, 0, 0)
5. Audio dispatch        — if impact: schedule lead + delayed-follow WebAudio sources
```

The **ball bitmap** is rasterized once at startup into `ballBuf` and *never* re-rasterized. The **wireframe room** is rasterized once at startup into `bgBuf` and *never* re-rasterized. After startup, the only mutating state per frame is: ball X/Y/velocity, palette slots 2..15 (and 18..31), and audio scheduling.

### Two-buffer indexed-color architecture

The Amiga used 5 bitplanes = 5 bits per pixel = 32 colors via a 32-entry palette. We emulate this with two `Uint8Array`s and a single `Uint32Array` palette:

| Buffer | Size | Values | Role |
|---|---|---|---|
| `ballBuf` | `Uint8Array(336 * 216)` | 0 = transparent, 1 = silhouette/rim, 2..15 = facet stripe colors | The static ball. Drawn once. Composited at an X/Y offset every frame. |
| `bgBuf` | `Uint8Array(320 * 216)` | 0 = empty sky, 1 = wireframe line | The static wireframe room. Drawn once. |
| `palette` | `Uint32Array(32)` | RGBA values | Slots 0..15 low-half, 16..31 high-half. Slots 2..15 rewritten every frame. |
| `imageData` | `ImageData(320 × 216)` | RGBA | Output, blitted via `putImageData`. |

`ballBuf` is sized larger than the visible viewport (336×216, matching the Amiga's offscreen buffer) so the ball offset can move the ball within it without falling off either edge.

### The composite rule (the 5th-bitplane palette-half-toggle, expressed as JS)

For each visible pixel `(x, y)` in 0..319 × 0..215:

```ts
const ballIdx = ballBuf[(x + ballOffX) + (y + ballOffY) * BALL_W];   // 0 if outside ball region
const bgBit   = bgBuf[x + y * 320];                                  // 0 or 1
let finalIdx: number;
if      (ballIdx === 0) finalIdx = bgBit ? 16 : 0;                   // sky or wireframe
else if (ballIdx === 1) finalIdx = bgBit ? 17 : 1;                   // rim — different color over wireframe
else                    finalIdx = bgBit ? ballIdx + 16 : ballIdx;   // facets — same value either side
imageData.data32[x + y * 320] = palette[finalIdx];
```

Note the asymmetry: ball facet slots 2..15 and 18..31 always hold *identical* RGBA values, so a ball facet pixel renders the same whether the wireframe is behind it or not. But slots 0/1 vs 16/17 differ: the sky and the ball's rim turn magenta-tinted where they overlap the wireframe. This is what produces the iconic "darker outline where the ball overlaps the floor" without any per-frame rim recomputation.

---

## 2. The palette — 32 entries, slots 2..15 cycled every frame

| Slot | Browser RGB | Amiga $0RGB | Role |
|---|---|---|---|
| 0 | `#AAAAAA` | `$0AAA` | Background sky |
| 1 | `#666666` | `$0666` | Ball silhouette / rim |
| 2..15 | 7×WHITE + 7×RED + 1×PINK, rotated per frame | — | Stripe cycle (one of these holds the highlight) |
| 16 | `#AA00AA` | `$0A0A` | Sky-over-wireframe (magenta wireframe lines) |
| 17 | `#660066` | `$0606` | Rim-over-wireframe (dark magenta) |
| 18..31 | mirror of 2..15 every frame | — | Keep in sync slot-for-slot |

### Stripe values

- `WHITE = #FFFFFF` (Amiga `$0FFF`)
- `RED = #FF0000` (Amiga `$0F00`)
- `PINK = #FFDDDD` (Amiga `$0FDD`) — the highlight, sits at exactly one slot per frame

### Per-frame palette rotation

```ts
// rotPhase ∈ 0..13, advanced each physics step:
//   if (vx < 0) rotPhase = (rotPhase + 1) % 14;   // ball moving left → cycle forward
//   else        rotPhase = (rotPhase + 13) % 14;  // ball moving right → cycle backward

for (let i = 0; i < 7; i++) {
  const slot = ((i + rotPhase) % 14) + 2;
  palette[slot] = palette[slot + 16] = WHITE;
}
for (let i = 7; i < 14; i++) {
  const slot = ((i + rotPhase) % 14) + 2;
  palette[slot] = palette[slot + 16] = RED;
}
const highlightSlot = ((vx >= 0 ? 0 : 6) + rotPhase) % 14 + 2;
palette[highlightSlot] = palette[highlightSlot + 16] = PINK;
```

The pink highlight sits at offset 0 of the cycle when the ball moves right, offset 6 when it moves left. This positions the specular highlight on the correct side of the sphere relative to rotation direction.

Reference: `src/main.s` `.palette_step` ~L1200.

---

## 3. The sphere — mesh, color formula, projection, draw

This is the heart of the demo. Implement precisely.

### 3.1 Mesh topology

- **9 latitude bands** (`lat = 0..8`), south pole at 0, north pole at 8.
- **56 longitudes per band** (`lon = 0..55`), spanning the **front hemisphere only** (`φ ∈ [0, π]`) — exactly like the upstream `globe.s` (`v = D5·257/56`, "scaled to 0..pi"). All 56 steps land on the visible face, giving the full **8 stripe-patches across the front**.
- 504 vertices total; 8 inter-band strips × 55 quad columns = **440 facets**, all front-facing (no cull).

### 3.2 Vertex generation

```ts
for (let lat = 0; lat <= 8; lat++) {
  const theta = (lat / 8) * Math.PI;
  for (let lon = 0; lon < 56; lon++) {
    const phi = (lon / 56) * Math.PI;             // FRONT HEMISPHERE (not 2π — see §3.1)
    const v = vertices[lat * 56 + lon];
    v.x = R * Math.sin(theta) * Math.cos(phi);
    v.z = R * Math.sin(theta) * Math.sin(phi);
    v.y = R * Math.cos(theta);                    // no /2 squash (the upstream cos/2 is
                                                  // offset by its _Sine16 angle scale; our
                                                  // projection alone yields the 1.16:1 oblate)
    v.color = ((lat & 1) * 7 + lon) % 14 + 2;     // THE diagonal-stripe formula
    // projection below
  }
}
```

### 3.3 The diagonal-stripe color formula

```
v.color = ((lat & 1) * 7 + lon) % 14 + 2     // result in 2..15
```

Even bands (`lat & 1 == 0`) have phase offset 0; odd bands have phase offset 7 — exactly half the 14-color cycle. Adjacent bands are therefore *opposite* in color: where band `lat` has white-at-some-lon, band `lat+1` has red-at-the-same-lon. This staircase between bands is what looks like a **diagonal spiral** when the palette cycles. Drop the `(lat & 1) * 7` term and adjacent bands align → horizontal rings → beach ball, not Boing.

Reference: `src/globe.s` color-computation block; [`vendor/amiga-boing/docs/BOING-ANALYSIS.md`](../vendor/amiga-boing/docs/BOING-ANALYSIS.md) §4.4.

### 3.4 Projection — baked rotation, shift-and-add origin

```ts
// In src/ball.ts. R = 80, PROJ_SCALE = 0.40, PROJ_CX = 168, PROJ_CY = 108.
v.projX = PROJ_CX + (v.y / 2 + v.x * 1.6875) * PROJ_SCALE;
v.projY = PROJ_CY - (v.y * 1.4375 - v.x / 2) * PROJ_SCALE;
```

The magic constants `1.6875 = 2 - 1/4 - 1/16` and `1.4375 = 1 + 1/2 - 1/16` come from the original 68000 implementation choosing rotation angles whose sine/cosine values decompose into a few binary shifts — so the matrix multiply is `shift + add` rather than a true multiply. We keep the same constants because they produce the ~30° camera rotation that makes the spiral visibly diagonal.

`PROJ_SCALE = 0.40` replaces the original's `/512` Q-format scale. The original ran on FFP-scaled inputs much larger than R; with floating-point unit-circle coords scaled by `R = 80`, `0.40` lands the projected ball at **111 × 97 px** — matching the original AMICUS demo (111 × 96, [`vendor/amiga-boing/docs/ANIMATION-DETAILS.md`](../vendor/amiga-boing/docs/ANIMATION-DETAILS.md) §6).

Note the projection is a function of vertex **x and y only** — `z` never appears. So two vertices differing only in z project to the same point, and the (x,y) image of the sphere is a filled disk that the affine map turns into an ellipse. This matters for the silhouette (§3.5).

`(PROJ_CX, PROJ_CY) = (168, 108)` centers the ball inside the 336×216 `ballBuf` so the scroll offset can shift it both ways. Composite then expresses ball motion as `ballOffX = PROJ_CX - ball.x`, `ballOffY = PROJ_CY - ball.y`.

### 3.5 Drawing — offset drop-shadow + 440 facet quads

Two passes into `ballBuf`, in order — matching `globe.s` `_draw_globe`:

**Pass 1 (drop-shadow):** A direct port of `_draw_globe` **Phase A** (`globe.s` L286–603). The original calls `SetAPen(rp, 1)` then fills **one 16-vertex polygon** (`AreaMove` + 15× `AreaDraw` + `AreaEnd`) *before* the facets. Decoded from the assembly (FFP bit-patterns; full decode in [`AMICUS-SOURCE-GEOMETRY.md`](AMICUS-SOURCE-GEOMETRY.md)), this polygon is a **plain, axis-aligned ellipse** — *not* the ball outline: per vertex `θ = 12° + k·22.5°`, `x = 55·cos θ + 185`, `y = 50·sin θ + 55`, in the original's 336×216 bitmap where the ball (Phase B) is centered at `(160, 55)`. So the shadow is an upright ellipse, half-axes **(55, 50)**, offset **(+25, 0)** px from the ball center, drawn with pen 1. `drawShadow()` in `src/ball.ts` reproduces it about our ball center `(PROJ_CX, PROJ_CY)` (our ballBuf is also 336×216 and our pixel scale matches the original). There is **no co-located silhouette/rim** — the only pen-1 fill is this offset shadow.

**Pass 2 (facets):** For each `(lat, lon)` with `lat ∈ 0..7, lon ∈ 0..54` (longitude does **not** wrap — `lon 55→0` would be the back seam): fill the quad through the four vertex projected positions with `palette_index = vertex.color`. There is **no back-face cull** — the mesh is the front hemisphere only (§3.1), so every facet faces the viewer. (The upstream `globe.s .L22` cull exists because it also builds only the front hemisphere; our equivalent is simply not generating or drawing the rear.)

The facets overpaint the part of the shadow they cover (the shadow's left half sits behind the ball), leaving the **offset crescent** to the lower-right as index 1. Over the grey sky that crescent reads as dark grey (slot 1 = `#666`); where it overlaps the wireframe the composite's index-1 → slot-17 toggle darkens the grid to dark-magenta (`#660066`). This is the AMICUS shadow — baked into the static ball bitmap, scrolling locked to the ball (no per-frame redraw, no second blit; `_draw_globe` runs once, `main.s:518`). Full source-derived trace: [`AMICUS-SOURCE-GEOMETRY.md`](AMICUS-SOURCE-GEOMETRY.md).

### 3.6 Scanline polygon filler

Write a small JS scanline filler in `src/ball.ts` that takes a polygon (array of `{x, y}` in screen-pixel coordinates), a palette index, and a target `Uint8Array` + width. Algorithm:

1. Find min/max Y across vertices, clip to buffer bounds.
2. For each scanline Y in that range, collect X-intersections with every polygon edge (linear interpolation between vertex pairs).
3. Sort intersections, fill spans between consecutive pairs with the palette index.

No Canvas2D. Direct `Uint8Array` writes. ~50 lines. This guarantees hard-pixel facet edges — Canvas2D's polygon fill anti-aliases edges, which would soften the stripe.

---

## 4. The wireframe room

Drawn once at startup into `bgBuf` (1 = line, 0 = empty), with `palette_index = 1` on the bg-bit — composites to `#AA00AA` (magenta).

Coordinates ported directly from `src/main.s` `.bgrenderloop` (~L542-630):

- **Back-wall verticals:** X = 48, 64, ..., 288 (step 16, 16 lines) from Y=0 to Y=192.
- **Back-wall horizontals:** Y = 0, 16, ..., 192 (step 16, 13 lines) from X=48 to X=288.
- **Perspective rays:** 16 lines from `(X, 192)` to `(160 + (X - 160) * 1.25, 215)` for each back-wall vertical, fanning out to the front floor edge.
- **Floor trapezoid rows:** 4 horizontals at original Y = 194, 197, 201, 207 with trapezoidal widths matching the `.floor_rowN` math (X spans 45..291, 41..295, 37..300, 30..308).
- **Floor front:** full-width horizontal at original Y = 215.

The framebuffer is **320×216**, so the room is drawn at its true Amiga buffer Y (0..215) with `ROOM_Y_OFFSET = 0` — the whole room is visible, including the topmost back-wall horizontal at Y=0 and the floor front edge at Y=215.

The wireframe never animates.

Reference: [`vendor/amiga-boing/docs/BOING-ANALYSIS.md`](../vendor/amiga-boing/docs/BOING-ANALYSIS.md) §8.8.

---

## 5. Physics

A **direct port of the AMICUS source step** (`main.s .physics_x`/`.physics_y`, decoded — see [`AMICUS-SOURCE-GEOMETRY.md`](AMICUS-SOURCE-GEOMETRY.md) and the vendored `ANIMATION-DETAILS.md` §3–§5,§8–§9). The source uses Motorola FFP mixed with integer math; we use plain JS `number`, but every constant and the per-step order are the source's — **nothing is visually tuned**. The motion is perfectly **elastic** (the source's damping term is dead, `_dampy = 0`), so the ball bounces forever with zero decay.

### 5.1 State

```ts
// All in screen-pixel coords on the 320×216 framebuffer.
ball.x: number;        // ball center X
ball.y: number;        // ball center Y (gravity acts on this axis)
ball.vx: number;       // X velocity (±1 px per step)
ball.vy: number;       // Y velocity
ball.rotPhase: number; // 0..13, advanced ±1 per step by sign(vx)
// `paused` lives in main.ts and gates the step callback.
```

### 5.2 Constants

`_left = -80` / `_right = +104` are the source's signed offsets; the ball's screen-center X = `_x + 160` (the bitmap ball-center X; ViewPort `DxOffset = 0`, screen `LeftEdge = 0`, so there's no scroll base), so we bake +160 in. Vertical works on the source's float `fy`, mapped to screen by `+ BASE_Y` (the bitmap ball-center Y).

| Name | Value | Source |
|---|---|---|
| `LEFT_SCREEN` | 80 (= 160 + -80) | `main.s:215` (`_left`); base 160 — **exact** |
| `RIGHT_SCREEN` | 264 (= 160 + +104) | `main.s:217` (`_right`); base 160 — **exact** |
| `VY_DIV` | 10 — `fy += trunc(vy/10)` | `main.s` `_vy / 10` — **exact** |
| `GRAVITY_STEP` | 1 (`vy += 1` per step) | `main.s` `_ay = 1` — **exact** |
| `FLOOR_FY` | 96 — reflect when `fy > 96` | `main.s .physics_y` FFP threshold — **exact** |
| `FY_INIT` | 1.0 — initial `fy` (apex) | `main.s` `_fy = $80000041` — **exact** |
| `BASE_Y` | 55 — screen-Y = `round(fy) + 55` | bitmap ball-center Y (`globe.s` `-45 + 100`); `DyOffset = 0` — **exact** |
| `APEX_Y` / `FLOOR_SCREEN` | 56 / 150 (derived) | `fy` swings 1..95 → center 56..150 |
| `INITIAL_VX` | 1 | source ±1 — **exact** |

The horizontal base is **160** (the ball-body projection center, which the floor perspective rays converge on), from source: `DxOffset = DyOffset = 0`, screen `TopEdge/LeftEdge = 0`, window column 0 = bitmap column 0 — the ball is centered on the room.

### 5.3 Per-step update — exact source algorithm

`stepPhysics()` runs via a fixed-step accumulator in `loop.ts` at **one step per video field** — the demo's true update rate (the AMICUS loop advances once per frame, paced by the `WaitTOF` inside `RethinkDisplay`; `ANIMATION-DETAILS.md` §1). We run **60 Hz** (`PHYSICS_DT = 1/60`) — the NTSC field rate of the original 1984 demo; PAL would be 50 Hz, ~0.83× slower. The per-step constants below are source-exact; the field rate sets the wall-clock tempo. Pause gating lives in `main.ts`. Per-step order matches the source (`ANIMATION-DETAILS.md` §8): rotate, Y arc, X step, gravity **last**.

```ts
// Rotation: ±1 per step, direction = sign(vx) (flips at each wall).
ball.rotPhase = ball.vx >= 0 ? (ball.rotPhase + 13) % 14 : (ball.rotPhase + 1) % 14;

// Vertical: the source's float `fy`, integer-divide gravity arc + ELASTIC reflect.
ball.fy += Math.trunc(ball.vy / VY_DIV);
if (ball.fy > FLOOR_FY) {
  ball.fy = 2 * FLOOR_FY - ball.fy;     // 192 - fy (reflect about the floor)
  ball.vy = -ball.vy;                   // elastic velocity flip (dampy = 0)
  impact  = 'floor';
}
ball.y = Math.round(ball.fy) + BASE_Y;  // on-screen ball-center Y

// Horizontal: ±1 px/step, elastic mirror reflection.
ball.x += ball.vx;
if (ball.x <= LEFT_SCREEN)  { ball.x = 2 * LEFT_SCREEN  - ball.x; ball.vx = -ball.vx; impact = 'wall-left'; }
if (ball.x >= RIGHT_SCREEN) { ball.x = 2 * RIGHT_SCREEN - ball.x; ball.vx = -ball.vx; impact = 'wall-right'; }

ball.vy += GRAVITY_STEP;  // gravity LAST (source order)
```

The `trunc(vy / 10)` is the load-bearing source formula (`ANIMATION-DETAILS.md` §4): vy must build to 10 before `fy` moves a pixel, so the ball *hangs* ~10 steps at the apex then snaps down — the characteristic Boing gravity feel, not a smooth parabola.

**Verified (numeric simulation of the exact `fy` step, not a screenshot):** horizontal 184 px range over a **184-step** wall-to-wall traverse; vertical `fy` swings 1..95 → screen-center 56..150 (94 px), ball bottom at floor ≈ 198 (≈2nd floor perspective row), bounce period **96 steps**. Step counts are rate-independent; at the 60 Hz field rate that's **~3.07 s traverse / ~1.6 s bounce** (PAL 50 Hz → ~3.68 s / ~1.92 s). **Zero drift** across a 20-minute run. The ball never settles, exactly like the original.

Reference: `src/main.s` `.physics_y` L1505–1564, `.physics_x` ~L1591/1605.

### 5.4 Rotation rate

Apparent rotation is palette cycling **once per step**. A full palette cycle is 14 phase steps and corresponds to **¼ of a visible ball rotation** (56 longitudes / 14 colors = 4 stripe-repeats around the circumference). The period is `14 / playback-Hz`:

```
60 Hz (NTSC field rate): 14 / 60 ≈ 0.23 s   (current)
50 Hz (PAL field rate):  14 / 50 ≈ 0.28 s
```

Like everything else, the per-step behaviour is source-exact; the wall-clock period just scales with the chosen playback rate (§5.3).

---

## 6. Audio

### 6.1 Sample asset

File: `src/boing.samples` (copy from the upstream Amiga repo's `boing.samples`, 24706 bytes total). Imported by `audio.ts` via Vite's `?url` query so it gets base64-inlined into the single-file build (see §10.1).

- Bytes 0..1: 2-byte header (value `0x0002`), discard.
- Bytes 2..24705: 24704 samples of 8-bit signed PCM, mono.

To load:

```ts
import sampleUrl from './boing.samples?url';   // → data:URL at build time
const buf = await (await fetch(sampleUrl)).arrayBuffer();
const pcm = new Int8Array(buf, 2);                          // skip 2-byte header
const audioBuf = audioCtx.createBuffer(1, pcm.length, NATIVE_RATE);
const ch = audioBuf.getChannelData(0);
for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 128;
```

Choose `NATIVE_RATE = 22050`. The Amiga Paula plays at a rate that depends on its period register; on NTSC, `rate = 3579545 / period` Hz. We replicate the two original periods via `AudioBufferSourceNode.playbackRate`:

| Impact | Paula period | Native Hz | playbackRate (with 22050 base) | Volume |
|---|---|---|---|---|
| Floor | 255 | ~14036 | `14036 / 22050 ≈ 0.637` | 1.0 |
| Wall | 160 | ~22372 | `22372 / 22050 ≈ 1.015` | 40/63 ≈ 0.635 |

Reference: `src/main.s` `_bperiod = 255` (L1888), `_bvolume = 63` (L1889), `_speriod = 160` (L1890), `_svolume = 40` (L1891).

### 6.2 Dual-channel lead-and-follow stereo

The signature stereo effect is *not* a single panner. The original plays the sample on **two channels**:

- **Lead channel**: the side closer to the impact. Full volume. Starts at sample offset 0.
- **Follow channel**: the far side. Reduced volume *and* starts playing a few milliseconds later — inter-aural time delay.

Volume formula for the follow channel:

```
followGain = vol * (BALANCE_MAX - |balance|) / BALANCE_MAX
where BALANCE_MAX = 54613    // from src/anim.s:288, 293
```

Delay scales with `|balance|` up to ~10 ms (`_maxDelay = 10` demo units in `src/anim.s:651`); 4-8 ms is the comfortable browser range.

`balance` is a signed integer representing the X-spatial bias of the impact. In the Amiga's audio convention, **positive `balance` means the LEFT channel is the lead** (sound source on the left); negative means the right. Because `ball.x` is in screen coords, we convert to signed first (`signedX = ballX - 160`):

- **Floor impact:** `balance = -signedX * 384` — ball at left (`signedX < 0`) gives `balance > 0` → lead-left. Same-side as the impact. (`main.s:1747`)
- **Left-wall impact** (`ball.x <= LEFT_SCREEN`): `balance = +30000` → lead-left. Ball hit the left wall, the bang comes from the left. (`main.s:1762`)
- **Right-wall impact** (`ball.x >= RIGHT_SCREEN`): `balance = -30000` → lead-right.

WebAudio's `StereoPannerNode` uses the *opposite* sign convention (positive = right). `audio.ts` negates `balance / BALANCE_MAX` to flip it into WebAudio's frame.

Browser dispatch:

```ts
function trigger(kind: 'floor' | 'wall-left' | 'wall-right', ballX: number) {
  const balance = kind === 'floor' ? -ballX * 384
                : kind === 'wall-left' ? +30000
                : -30000;
  const absBal = Math.abs(balance);
  const pan = Math.max(-1, Math.min(1, balance / BALANCE_MAX));
  const vol = kind === 'floor' ? FLOOR_VOL : WALL_VOL;
  const rate = kind === 'floor' ? 0.637 : 1.015;
  const leadGain   = vol;
  const followGain = vol * (BALANCE_MAX - absBal) / BALANCE_MAX;
  const delaySec   = Math.abs(pan) * MAX_DELAY_SEC;   // MAX_DELAY_SEC ≈ 0.006

  // Lead: pan toward sign(pan), full vol, no delay
  const leadSrc = audioCtx.createBufferSource();
  leadSrc.buffer = audioBuf; leadSrc.playbackRate.value = rate;
  const leadPan = new StereoPannerNode(audioCtx, { pan: Math.sign(pan) });
  const leadGainNode = new GainNode(audioCtx, { gain: leadGain });
  leadSrc.connect(leadPan).connect(leadGainNode).connect(audioCtx.destination);
  leadSrc.start();

  // Follow: pan opposite, reduced vol, delayed
  const followSrc = audioCtx.createBufferSource();
  followSrc.buffer = audioBuf; followSrc.playbackRate.value = rate;
  const delay = new DelayNode(audioCtx, { delayTime: delaySec });
  const followPan = new StereoPannerNode(audioCtx, { pan: -Math.sign(pan) });
  const followGainNode = new GainNode(audioCtx, { gain: followGain });
  followSrc.connect(delay).connect(followPan).connect(followGainNode).connect(audioCtx.destination);
  followSrc.start();
}
```

When `balance == 0` (e.g., floor impact dead-center), both gains equal `vol` and `delaySec` is 0 — the two channels play identically and sum to a centered mono boom. As `|balance|` grows, the follow channel quiets and lags. At full extreme (`|balance| ≥ BALANCE_MAX`), follow goes silent and only the lead channel plays.

### 6.3 AudioContext lifecycle

Modern browsers create the `AudioContext` suspended until a user gesture. `audio.ts` builds the buffer immediately (the buffer's `createBuffer` doesn't need a running context) and exports `resumeAudio()`. `main.ts` calls it on the very first click/Space; subsequent interactions toggle pause instead.

Reference: `src/anim.s` `.voice_loop` L268-293.

---

## 7. Display geometry

- **Virtual screen:** 320×216 pixels (the indexed framebuffer). 216 (not 200) so the full wireframe room — back-wall top horizontal at Y=0 through the floor front edge at Y=215 — renders without clipping (see §6).
- **Boing canvas size:** 1280×864 = 4× CSS scale.
- **Wrapper (`#demo`) size:** 1280×**984** CSS. Boing canvas sits at the top (y=0..864); the bottom 120 CSS px is a sky-colored strip (`background: #aaaaaa`) so the Workbench title bar at maximum drag-down (`splitY = SPLIT_MAX = 944`) lands fully below the canvas without overlapping the front-floor edge. The strip is an 80 CSS px gap (2× WB header height) plus the 40 CSS px header.
- **CSS:** `image-rendering: pixelated; image-rendering: crisp-edges;` to defeat browser interpolation.
- **Aspect ratio:** square pixels (1:1). The Amiga NTSC was ~1:1.2 (slightly tall); we ignore that per spec.
- **Frame loop:** `requestAnimationFrame` with a fixed-step physics accumulator in `loop.ts` at **one step per video field** — the demo's true rate (`ANIMATION-DETAILS.md` §1). Runs at **60 Hz** (`PHYSICS_DT = 1/60`, the NTSC field rate); PAL would be 50 Hz. The composite step runs every animation frame, so motion stays as smooth as the display allows regardless of the physics tick.
- **Fullscreen:** the `f` key toggles native fullscreen on the canvas.

---

## 8. Interaction

The demo starts with `paused = true` and a `started = false` flag. A "CLICK OR PRESS SPACE / TO START" overlay is drawn on top of the composite output until the user interacts.

| Input | Action |
|---|---|
| First click or Space | Sets `started = true`, `paused = false`, and calls `resumeAudio()` |
| Subsequent click or Space | Toggle `paused` |
| Drag Workbench title bar | Pull the desktop down to expose more / push back up to hide. Bare clicks on the title bar still propagate (start/pause); only clicks that involved movement are suppressed via a `suppressNextClick` flag in `workbench.ts`. |
| Click right-hand WB depth gadget | Enter State B (Boing forward, WB hidden). See §8.2. |
| Click top-right of canvas (State B) | Phantom hit box — return to State A. |
| `Tab` | Toggle A↔B. `preventDefault()` so focus doesn't shift. |
| `Escape` | Return to State A (no-op in A). |
| `f` | Toggle fullscreen |
| Right-click | Browser default (context menu); not intercepted |

Coupling "start the bounce" and "enable audio" into the same first gesture ensures the first bounce is audible — otherwise the suspended `AudioContext` would silently swallow several early impacts before the user thought to click.

### 8.1 The start overlay

`src/font.ts` ships 8×16 glyph bitmaps for the 12 characters the message uses, traced from the Topaz Double Sans reference PNG in [amigavision/TopazDouble](https://github.com/amigavision/TopazDouble) (MIT, © 2024 Alex Limi). `drawText(ctx, x, y, text, color, outlineColor?)` collects lit pixels first, then paints a 1-px orthogonal outline (if given) and the fill — each pixel as a 1×1 `ctx.fillRect`. CSS scaling turns those into chunky 4×4 blocks. Rendered after `putImageData` so it composites on top of the indexed framebuffer without disturbing palette logic. Positioned in the gap between wireframe horizontals at Y=112 / 128 so the magenta back-wall lines don't cut through the text.

### 8.2 State A / State B screen Z-order

The screen stack has two states, mirroring the Amiga Intuition depth-gadget:

| State | `boingForward` | Effect | What user sees |
|---|---|---|---|
| **A** (default) | `false` | WB `<img>` visible, drag enabled, `splitY` ∈ [0, 944] | WB at bottom (default `splitY = 600`), draggable, Boing above |
| **B** | `true` | WB `<img>` `display: none`, drag inert (no title bar to grab) | Full 320×216 Boing, no chrome |

`boingForward` is owned by `src/workbench.ts`. `setBoingForward(b)` toggles `<img id="workbench">`'s `display`; `toggleBoingForward()` is the keyboard-bound flip. `splitY` is **preserved** across transitions — entering B then returning to A lands the desktop where the user last left it.

#### Hit boxes

Right-hand WB depth gadget (send-to-back) — native pixel ranges on the 640×200 source bitmap, CSS scale 2× horizontal / 4× vertical:

```
WB_GADGET_BACK_X     = 614 * 2           = 1228 CSS x   (wrapper-local)
WB_GADGET_BACK_W     = (637-614+1) * 2   = 48  CSS width
WB_GADGET_BACK_Y_REL = 1 * 4             = 4   CSS y    (relative to title-bar top)
WB_GADGET_BACK_H     = (8-1+1)  * 4      = 32  CSS height
```

The gadget translates with the WB layer — its absolute Y range is `[splitY + 4, splitY + 36]`. The **phantom** hit box (State B → A) uses the same X/W and Y/H, but pinned to the top of the wrapper (`splitY = 0`) — so it always sits at the top-right corner of the Boing canvas regardless of where WB *was* when last visible. Both hit boxes are bigger than the visible glyph by a CSS pixel or two; tight ones would break on the slightly-imperfect retouched bitmap.

#### Click semantics

A press inside the gadget hit box (State A) or the phantom hit box (State B) latches a `pressedGadget` / `pressedPhantom` flag and sets pointer capture. The matching `pointerup` inside the same hit box fires the state transition and sets `suppressNextClick`, which short-circuits the wrapper's capture-phase `click` listener — so the post-press `click` event doesn't also reach the window-level pause toggle. A pointer that drifts out of the hit box before release is discarded (no transition, no click suppression). This mirrors Workbench gadget semantics — a click only counts if you release on the gadget you pressed.

The `suppressNextClick` flag replaces the prior `didDrag` flag; it's also set whenever a real drag moved `splitY`, preserving the original behaviour that drag-release doesn't toggle pause.

#### Keyboard

In `src/main.ts`'s `keydown`:

- `Tab` — `preventDefault()` (the demo has no other focus targets), then `toggleBoingForward()`.
- `Escape` — `setBoingForward(false)`. No-op in State A.

Bound to `window`, not the wrapper.

#### The 2-second hint

`<div id="hint">` inside `#demo` (z-index 8, `pointer-events: none`, bottom-center). CSS holds `opacity: 0` and a `transition: opacity 1500ms ease 500ms`. `setBoingForward(true)` snaps `opacity` to 1 with `transition: none`, then on the next animation frame restores the transition and sets `opacity: 0` — re-triggering the fade on every A→B. Returning to A (or any non-transition path) hides immediately with `transition: none`.

Copy: `Esc · Tab · top-right corner → back to Workbench`. The font is a generic system monospace; `src/font.ts`'s Topaz bitmap covers only the 12 start-overlay glyphs and doesn't have the lowercase or punctuation this hint needs.

#### Boundary conditions

- Boing animation runs identically in both states — nothing in the `composite()` / `startLoop()` pipeline changes. The swap is purely DOM visibility on the WB `<img>` and a flag.
- Bring-to-front (the left gadget icon) is decorative only. Its pixels are drawn in the source bitmap but no hit box is wired — matching real Amiga behaviour where clicking bring-to-front on a screen already in front is a no-op.

No other UI. No settings panel. No buttons.

---

## 9. Open questions — how each was resolved

From the spec, all seven open questions have spec-author defaults:

1. **Sphere Y-squash:** round sphere geometry. (`R * cos(theta)`, no `/2`.)
2. **Gravity & impact damping:** (c) hand-tune until it feels right.
3. **Wireframe room geometry:** (b) port the literal coordinate lists from `.bgrenderloop`.
4. **Audio sample fidelity:** ship the original `boing.samples` byte-for-byte.
5. **Default canvas size:** 4× scale, optional fullscreen on `f`.
6. **Ball at rest:** never. Apply a small floor-bounce energy boost if FP drift drains energy over time.
7. **Touch/mobile:** render but unsupported. No special handling.

Additional decisions for this port:

- **Testing:** none. Verification by eye and ear in the browser, plus UAE side-by-side.
- **Polygon fill:** custom JS scanline filler in `ball.ts`, direct `Uint8Array` writes. No Canvas2D for indexed buffers.

---

## 10. File layout

```
boing-web/
├── README.md
├── CLAUDE.md
├── docs/
│   ├── IMPLEMENTATION.md         ← this file
│   ├── SPEC-HOW-TO.md            ← feature-start workflow
│   └── agentic-engineering-personal-guide.md
├── specs/
│   ├── archive/
│   │   ├── 2026-05-23-boing-browser-port.md
│   │   └── 2026-05-24-workbench-split-screen.md
│   └── workbench/                ← assets + reproducible retouch script for §10.2
│       ├── amiga1wb13.png
│       ├── amiga1splitscreensm.png
│       └── retouch.py            ← paints over the cursor, de-interlaces, crops
├── .gitignore
├── package.json                  ← Vite 8 + TypeScript 6 + vite-plugin-singlefile
├── package-lock.json
├── tsconfig.json
├── vite.config.ts                ← single-file build config (see §10.3)
├── index.html                    ← #demo wrapper: #screen + #workbench + #cursor
├── scripts/
│   └── record-demo.ts            ← Playwright + ffmpeg recording pipeline (see §10.2)
└── src/
    ├── main.ts                   ← canvas + workbench + cursor init, fitToViewport, loop
    ├── style.css                 ← position-fixed wrapper, pixelated, hidden native cursor
    ├── palette.ts                ← 32-entry palette + stepPalette()
    ├── composite.ts              ← per-pixel walk into ImageData
    ├── ball.ts                   ← sphere mesh + projection + scanline filler + draw
    ├── room.ts                   ← wireframe coordinates, Bresenham line draw
    ├── physics.ts                ← ball state + stepPhysics + impact emit
    ├── audio.ts                  ← sample + masterGain tap + dual-channel dispatch
    ├── loop.ts                   ← rAF + 60Hz physics accumulator (one step/field)
    ├── font.ts                   ← Topaz Double Sans glyphs for the start overlay
    ├── workbench.ts              ← screen-drag overlay + splitY state + A/B depth-swap + click suppression
    ├── workbench.png             ← retouched Workbench 640×200 (inlined into the bundle)
    ├── cursor.ts                 ← Amiga 1.3 mouse pointer sprite + pointer tracking
    ├── record.ts                 ← MediaRecorder shim, loaded only on ?record (see §10.2)
    └── boing.samples             ← 24 KB 8-bit signed PCM (inlined into the bundle)
```

### 10.1 Workbench screen-drag overlay

`src/workbench.ts` adds an `<img>` layer over the canvas. The image is the AMICUS Workbench screenshot, de-interlaced to **640×256 native** by `specs/workbench/retouch.py` (the source PNG is PAL hi-res interlaced 640×512 with every two rows identical). CSS scales it to **1280×1024** at 2× horizontal / 4× vertical — half-wide pixels, same vertical density as Boing's lo-res, the canonical Amiga hi-res non-interlaced look. The image is taller than the 984-CSS wrapper on purpose: when the user drags the title bar to `splitY = 0`, the image extends from y=0 to y=1024 and the bottom 40 CSS px clip past the wrapper. This guarantees that every visible row of the wrapper while WB is up shows real WB content, never the sky-grey background. The image's `top` is bound to `splitY` from JS, so the whole image translates with the drag, exactly like an Amiga screen-drag: the title bar at image row 0 always sits at screen Y = `splitY`. The wrapper's `overflow: hidden` hides anything that runs past the bottom of the viewport. Drag the title bar band (`y ∈ [splitY, splitY + 40]`) to update `splitY`; `setPointerCapture` keeps the drag alive once the pointer leaves the band. A `suppressNextClick` flag suppresses the post-drag click so the window-level pause-toggle doesn't fire on every drag release; the same flag also short-circuits clicks that resolve an A↔B depth-swap (see §8.2).

The demo wrapper itself is `position: fixed` with `transform-origin: top left`; JS-driven `fitToViewport()` sets `left`, `top`, and `transform: scale(...)` from `window.innerWidth/innerHeight` so the demo fits any viewport without clipping. `#demo`'s `getBoundingClientRect()` returns the post-transform rect; pointer-event coords in `workbench.ts` and `cursor.ts` divide out the current scale (`rect.height / offsetHeight`) to convert viewport coords back to wrapper-local.

`src/cursor.ts` ships a 16×16 sprite traced from the original Workbench screenshot (red body, light highlight, black outline, transparent). Painted once into an offscreen `<canvas id="cursor">` at native resolution, then translated by `pointermove` listener on the wrapper. CSS `cursor: none` on the wrapper hides the native pointer; `pointer-events: none` on the sprite ensures it never intercepts clicks.

The completed spec for this feature with deviation / lesson notes: [`specs/archive/2026-05-24-workbench-split-screen.md`](../specs/archive/2026-05-24-workbench-split-screen.md).

### 10.2 Recording pipeline (`npm run record`)

Produces two artifacts in `docs/`:

- **`demo.mp4`** — 1280×984, h264 + stereo AAC, ≈ 10 s. Source of truth.
- **`demo.gif`** — 640×492, 24 fps, silent. Derived from the MP4 — never drifts from it.

Pipeline (`scripts/record-demo.ts`):

1. `npm run build`, then spawn `vite preview --port 4173 --strictPort` directly via `npx` (not via `npm run`, which swallows `--` args on some npm versions).
2. Launch headless Chromium via Playwright at viewport 1280×984. **No `recordVideo`** — instead a CDP session calls `Page.startScreencast({ format: 'jpeg', quality: 92, everyNthFrame: 1 })` which streams every page paint as a base64-JPEG frame. Headless captures at ~72 fps this way; the demo's 30 Hz palette cycle aliases visibly at the ~18 fps `recordVideo` does.
3. Navigate to `/?record` — `main.ts` dynamic-imports `src/record.ts`, which exposes `__startRecording()` / `__stopRecording()` on `window`.
4. Audio capture: `audio.ts` runs every impact through a single `masterGain` node before `audioCtx.destination`. `tapMaster()` (called by the recording shim) connects `masterGain` to a `MediaStreamAudioDestinationNode` in parallel — a `MediaRecorder` records the resulting `MediaStream` to webm/opus. **No OS-level audio routing**; the tap lives entirely inside WebAudio.
5. Playwright drives the scripted sequence (recording starts *after* the click, so no overlay in-frame and the loop is seamless): click `(640, 400)` → bounce → pointer traverse to the title bar `(640, 620)` → drag down to `splitY≈944` (full Boing scene exposed) → settle → drag back up to `(640, 620)` → pointer returns to `(640, 400)`. Wall-clock timestamps `t0` and `tClick` are recorded so audio can be re-aligned to the click moment.
6. After the sequence, `cdp.send('Page.stopScreencast')`, then `page.evaluate(() => __stopRecording())` returns the audio blob as **base64** (`ArrayBuffer` doesn't survive Playwright's CDP serialization). Written to `tmp-record/audio.webm`.
7. ffmpeg muxes: `-framerate (frameCount/totalSec) -i frame_%05d.jpg -i audio.webm -filter:a adelay=clickMs|clickMs -c:v libx264 -pix_fmt yuv420p -c:a aac -t totalSec docs/demo.mp4`. The `-framerate` ensures encoded playback matches wall-clock; `adelay` puts the audio under the right video frame (skipping the silent pre-roll).
8. GIF derive — extract PNG frames from the MP4 at `fps=24,scale=640:nearest` into a dedicated `gif-frames/` dir (separate from the screencast JPGs), then encode with `gifski --quality 95 --fps 24`. gifski's per-frame local palettes give smaller, cleaner GIFs than ffmpeg's single-palette path (here ~3.9 MB vs ~5 MB).

Tool dependencies: **both `ffmpeg` and `gifski` are mandatory**. The script fails fast with a helpful message if either is missing (`checkTool` probes `ffmpeg -version` / `gifski --version`).

Completed spec with the full design + deviation/lesson notes: [`../specs/archive/2026-05-24-recordable-demo.md`](../specs/archive/2026-05-24-recordable-demo.md).

### 10.3 Single-file build

`vite.config.ts` wires [`vite-plugin-singlefile`](https://www.npmjs.com/package/vite-plugin-singlefile) with `build.assetsInlineLimit: 100000` so the 24 KB PCM sample *and* the Workbench PNG are base64-inlined alongside the JS bundle and CSS. The result is one self-contained `dist/index.html` (~54 KB after the Workbench feature; ~40 KB before) that runs under `file://` in any modern browser — no module loader, no fetch-of-local-files, no CORS.

`audio.ts` imports the sample with Vite's `?url` query:

```ts
import sampleUrl from './boing.samples?url';
// sampleUrl becomes a `data:` URL at build time. fetch() works under file://.
```

Dev (`npm run dev`) is unaffected — the plugin only activates on build.

---

## 11. Implementation order (one commit per step)

Reflected in `git log --oneline`. Steps 0–11 are the original port (spec `2026-05-23-boing-browser-port.md`); 12 onward are post-port iterations driven by their own specs / discipline.

0. Repo + project docs.
1. Vite scaffold; strip template; `<canvas>` + black-bg pixelated CSS.
2. Indexed framebuffer + palette + composite pixel-walk + test pattern.
3. Palette cycling against the test pattern.
4. Wireframe room: port `.bgrenderloop` coordinates into `bgBuf`.
5. Sphere vertex generation + projection.
6. Sphere silhouette pass + scanline filler.
7. Sphere facet pass + back-face cull.
8. Physics + animation loop (bouncing + rolling).
9. Audio: dual-channel dispatch with delay/pan/gain.
10. Pause / resume on click + Space.
11. Polish: page title, fullscreen on `f`, production build.

Post-port iterations:

12. Single-file build (`vite-plugin-singlefile` + `assetsInlineLimit`). Demo runs from `file://` in any browser, no server.
13. Workbench 1.3 screen-drag overlay + mouse pointer + responsive viewport scaling (spec `2026-05-24-workbench-split-screen.md`).
14. Recordable demo: `npm run record` → `docs/demo.mp4` (with sound) + `docs/demo.gif` (silent, derived from the MP4). Playwright CDP screencast + in-page WebAudio `MediaStreamDestination` tap + ffmpeg mux. Spec `2026-05-24-recordable-demo.md`.

---

## 12. References

| Topic | Reference |
|---|---|
| The design spec | `specs/archive/2026-05-23-boing-browser-port.md` |
| Animation technique | [`vendor/amiga-boing/docs/BOING-ANALYSIS.md`](../vendor/amiga-boing/docs/BOING-ANALYSIS.md) §4 |
| Sphere mesh + draw | [`vendor/amiga-boing/docs/BOING-ANALYSIS.md`](../vendor/amiga-boing/docs/BOING-ANALYSIS.md) §4.4 |
| Bitplane half-toggle | [`vendor/amiga-boing/docs/BOING-ANALYSIS.md`](../vendor/amiga-boing/docs/BOING-ANALYSIS.md) §4.4.6 |
| Non-obvious tricks | [`vendor/amiga-boing/docs/BOING-ANALYSIS.md`](../vendor/amiga-boing/docs/BOING-ANALYSIS.md) §8 |
| Variant lineage | [`vendor/amiga-boing/docs/DEMO-BACKGROUND.md`](../vendor/amiga-boing/docs/DEMO-BACKGROUND.md) §7.9 |
| Palette step asm | `src/main.s` `.palette_step` ~L1200 |
| Physics asm | `src/main.s` `.physics_y` ~L1540, `.physics_x` ~L1591/1605 |
| Audio dispatch asm | `src/main.s` `.audio_floor`/`.audio_left`/`.audio_right` ~L1720-1770 |
| Wireframe room asm | `src/main.s` `.bgrenderloop` ~L542-630 |
| Data constants asm | `src/main.s` `~L1840-1900` |
| Sphere math asm | `src/globe.s` |
| Stereo delay asm | `src/anim.s` `.voice_loop` L268-293 |
| Sample data | `boing.samples` (24706 bytes, 2-byte header + 8-bit signed PCM) |
| UAE reference setup | `uae/` |
