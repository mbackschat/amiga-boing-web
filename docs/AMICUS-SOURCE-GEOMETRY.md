# AMICUS source geometry — the authoritative numbers

Source-derived geometry for the port, decoded directly from the AMICUS Disk 9 assembly in [`vendor/amiga-boing/src/`](../vendor/amiga-boing/src/). **These numbers come from the `.s` source, not from screenshots.** Per `CLAUDE.md`, visual/pixel measuring must never be the basis for an implementation decision — this doc is where the source-derived truth lives. Keep it updated when new geometry is traced.

Values are decoded from the FFP bit-patterns and the traced instructions — the authority is the `.s` opcodes, not prose.

## FFP (Motorola Fast Floating Point) decode

A 32-bit longword `0xMMMMMMEE`: high 24 bits = mantissa (implicit leading 1 at bit 31, value in [0.5,1)), low byte `EE` = sign (bit 7) + exponent (bits 6..0, excess-64). Spec: [`AMIGA-KNOWHOW.md` §K.1](../vendor/amiga-boing/docs/AMIGA-KNOWHOW.md).

```python
def ffp(u):
    if u == 0: return 0.0
    mant = (u >> 8) / (1 << 24)          # [0.5, 1.0)
    ee = u & 0xFF
    sign = -1.0 if (ee & 0x80) else 1.0
    exp = (ee & 0x7F) - 64
    return sign * mant * (2.0 ** exp)
```

### Decoded constants used in `_draw_globe` (globe.s)

| Constant | Disassembler comment | **Actual decoded value** | Role |
|---|---|---|---|
| `$C90FD03F` | "≈ π" | **0.392699 = π/8** | per-vertex angle step (shadow) |
| `$C90FD043` | "≈ π·16" | **6.283180 = 2π** | degrees→radians factor |
| `$B4000049` | "−3.0" | **+360.0** | degrees→radians divisor |
| `$8CCCCD41` | "≈ 8.8" | **1.100000** | shadow Y-flatten divisor |
| `$B9000048` | "−100.0" | **+185.0** | shadow X-center (px) |

## The drop-shadow (this is real in AMICUS — it is NOT just a rim)

`_draw_globe` (`globe.s:286–1015`) is called **once** (`main.s:518`) and paints the ball **and** shadow into the same static 5-plane 336×216 bitmap; thereafter the whole thing is moved as one via ViewPort `RxOffset/RyOffset`. There is **no per-frame redraw and no second blit** — the shadow is baked in, offset from the ball, so it scrolls locked to it.

- **Phase A** (`globe.s:292–603`): `SetAPen(rp, 1)` then **one 16-vertex polygon**, `AreaMove` + 15×`AreaDraw` + `AreaEnd`-fill. The label `.outer_loop` is a misnomer — it runs **once** (no branch back). This single pen-1 filled ellipse **is the shadow.**
- **Phase B** (`globe.s:604–1015`): the red/white facet quads, drawn **on top**, per-facet `SetAPen` (`globe.s:887`).

There is **no co-located silhouette/rim** — the only pen-1 fill is the offset shadow.

### Shadow shape (decoded from Phase A)

Per vertex `D4 = 0..15`, `θ = rot_const + D4·(π/8)` (16 × 22.5° = full circle), `rot_const = 2π·_angoff/360 = 12°` (`_angoff=12`):

```
x = 55·cos(θ) + 185          ; _srad = $37 = 55 ; +185 = $B9000048
y = 55·sin(θ)/1.1 + (−45+100) ; _yoff = −$2D = −45 ; /1.1 = $8CCCCD41
  = 50·sin(θ) + 55
```

So the shadow is a **plain, axis-aligned ellipse** (NOT the sheared ball outline): half-axes **(55, 50) px**, center **(185, 55)**, drawn with pen 1.

### Ball shape (Phase B / `_init_globe`)

Projected tilted sphere (shift-add matrix, `globe.s:662–736`): center **(160, 55)**, half-axes **≈ (56, 48.5) px**. The ball is *sheared* (the diagonal-spiral tilt); the shadow is *upright*.

### The offset — shadow center − ball center

| | center x | center y | half-x | half-y |
|---|---|---|---|---|
| Shadow (Phase A) | 185 | 55 | 55 | 50 |
| Ball (Phase B) | 160 | 55 | ~56 | ~48.5 |

- **Offset = (+25, 0) px** — exactly right, **zero vertical**. (`185 − 160 = 25`; both share y-center 55 because `_yoff = −45` feeds both: Phase A as `−45+100`, Phase B as `100 + low_word(_yoff)`.)
- Shadow is **upright**, half-axes (55, 50); essentially ball-sized, slightly narrower and slightly taller, and not sheared.
- Pen **1** → palette slot 1 (`#666`, dark grey) over sky, slot 17 (`#660066`, dark magenta) over the wireframe.

### Port mapping (`src/ball.ts`)

Our `ballBuf` is also 336×216 and our ball pixel scale matches the original by design (ball ≈ 112×97 px both). So the original's absolute numbers transfer directly, expressed relative to our ball center `(PROJ_CX, PROJ_CY) = (168, 108)`:

- Shadow center = `(168 + 25, 108 + 0) = (193, 108)`.
- Shadow = 16-gon on the upright ellipse `x = 55·cos(θ) + 193`, `y = 50·sin(θ) + 108`, `θ = 12° + k·22.5°`.
- Draw with pen 1 **before** the facets; no co-located silhouette.

## Ball mesh (`_init_globe` + `_draw_globe` Phase B) — source-exact

Audited 2026-05-29 against the assembly (decoded from the shift/add instructions, not the comments):

- **9 latitude bands × 56 longitude steps** (`D4`=8→0 at `globe.s:76,236`; `D5`=`$37`=55→0 at `:126,233`).
- **Latitude θ = D4·32767/8** over a 65536=full-turn ⇒ 0°,22.5°,…,180° — a full pole-to-pole meridian (`globe.s:94-104`; the shift chain `asl#8; asl#6; sub; add` = ×32767).
- **Longitude φ = D5·32767/56** ⇒ 0°…176.8° — **front hemisphere only** (z = sinφ·sinθ ≥ 0) (`globe.s:147-157`).
- **Vertex:** `x = sinθ·cosφ`, `z = sinθ·sinφ`, **`y = cosθ/2`** (halved, `asr #1`, `globe.s:191`).
- **Colour:** `((D4&1)·7 + D5) mod 14 + 2` (`globe.s:217-231`).
- **Projection (Phase B1, `globe.s:662-736`):** `proj_x = 160 + (y/2 + x·1.6875)/512`, `proj_y = (100+yoff) − (y·1.4375 − x/2)/512`. **Uses only x and y; z is stored but never read.** Centre (160,100). Projected ball **111.9 × 97.2 px**.

Port (`ball.ts`): `LAT_BANDS=9 × LON_STEPS=56`, `θ=lat/8·π`, `φ=lon/56·π`, same colour formula, `proj` with `·1.6875`/`·1.4375` and `R=80, PROJ_SCALE=0.40` (provably equivalent to the source `/512` to 0.1 px on both axes — `16383/512 = 80·0.40 = 32.0`), centre `(168,108)`. **Verdict: source-exact.** The only deviation is the centre offset (intentional headroom in the 336×216 ballBuf; relative geometry identical). The port omits the `y` `/2` but compensates via `R/SCALE` — same result. The static-bitmap + palette-cycling design (vs the source redrawing every frame) is the intended 1984-CES model (invariant #1) and bakes this exact mesh.

## Wireframe room (`main.s .bgrenderloop`) — source-exact (one fix applied)

- Verticals X=48..288 step 16 (16 lines), Y 0→192 (`main.s:565,578-596`).
- Horizontals Y=0..192 step 16 (13 lines), X 48→288 (`main.s:607-626`).
- Perspective rays (X,192)→(`160+(X−160)·1.25`, 215); `$A0000041` = **1.25** exact (`main.s:641-670`).
- Floor rows (Y,xL,xR): (194,45,291)(197,41,295)(201,37,300)(207,30,308) (`main.s:719-882`).
- **Floor front edge: Y=215, X=20..319** (`main.s:884-901`).
- Dot/horizon marks (`main.s:903-1017`) are Move-only (no Draw) ⇒ invisible; correctly omitted.

**Verdict: 100% source-exact** after the front-edge fix.

## Bounce physics (`main.s .physics_y`, ~L1505-1623) — has GUESSED constants

Source-exact spec (confirmed by measured `ANIMATION-DETAILS.md`):

- Vertical: `fy += trunc(vy/10)` (integer `/10`, `main.s:1507-1517`); gravity `vy += 1` (`_ay=1`, `:1097`).
- Floor: **elastic** `vy = −vy` (`:1530-1538,1569`). Damping is **dead** (`_dampy=0`, never written, `:1919`) ⇒ perpetual bounce, never settles.
- Horizontal: `x += ±1` (`_ax=0`), mirror reflect, limits `_left=−80`, `_right=+104` ⇒ 184-px range about centre 160 (`:215-217`).
- Rate: **one step per video field** = 50 Hz PAL / 60 Hz NTSC (paced by the `WaitTOF` inside `RethinkDisplay`).
- **Ground truth (rate-independent):** vertical travel **90 px**, bounce **96 steps**, horizontal **1 px/step** (184-step traverse), palette step ±1 per step, direction = sign(vx). Wall-clock at the field rate: ~1.9 s bounce / ~49.6 px/s (PAL 50 Hz), ~1.6 s / ~59.5 px/s (NTSC 60 Hz).

**RESOLVED 2026-05-29 — re-derived to source-exact (user chose source tempo).** Port (`physics.ts`/`loop.ts`) now:

| Parameter | Source | Port | Verdict |
|---|---|---|---|
| Gravity step | `vy += 1` | `GRAVITY_STEP=1` | EXACT |
| Integrator divisor | `vy/10` | `VY_DIV=10` | EXACT |
| Vertical model | float `fy += trunc(vy/10)`; reflect `fy=192−fy` when `fy>96`; `vy=−vy` | identical; `ball.y = round(fy)+55` | **EXACT** |
| `fy` init | `$80000041` = 1.0 | `FY_INIT=1` | EXACT |
| Vertical travel | `_y` 1..95 → center 56..150 (94 px); bottom ≈198 | center 56..150 (94 px); bottom ≈198 | **EXACT** |
| Bounce period | 96 steps (~1.6 s @60Hz) | 96 steps = ~1.6 s @60Hz | EXACT |
| Floor handling | elastic, never settles (`_dampy=0`) | elastic `fy=192−fy`, `vy=−vy` | EXACT |
| Horizontal vx/limits/range | ±1, −80/+104, 184 px | ±1, 80/264, 184 px | EXACT |
| Horizontal speed / traverse | 24.8 px/s / 7.37 s | 24.8 px/s / **7.36 s** | EXACT |
| Update rate | one step/field (50 PAL / 60 NTSC) | 60 Hz (`loop.ts`, `PHYSICS_DT=1/60`) | EXACT |
| Rotation step | ±1 per step, dir=sign(vx) | ±1 per step, dir=sign(vx) | EXACT |
| Drift | none (elastic) | none (96-step period, /20 min) | EXACT |

Rate: **one physics step per video field** (`loop.ts` `PHYSICS_DT = 1/60`). We run **60 Hz** — the NTSC field rate of the original 1984 demo (~1.6 s bounce); PAL would be 50 Hz (~1.9 s), ~0.83× slower. **All physics constants are the literal source values; nothing is measurement-tuned.**

## Screen placement (ViewPort base offsets) — source-exact, NOT measured

The ball moves via `RxOffset = _x`, `RyOffset = -_y` on the 336×216 bitmap; the room is on a counter-scrolled plane and stays fixed. So `screen_center = bitmap_ball_center + (_x, _y)`. From source: **`DxOffset = DyOffset = 0`** (no write exists anywhere in the `.s`; OS default), screen **`TopEdge = LeftEdge = 0`** (`NewScreen`, `main.s:389-390`), bitmap plane base has no sub-pixel offset.

- **BASE_X = 160** — the bitmap ball-body (facet) projection center (`globe.s` `+160`), which is also where the floor perspective rays converge (`main.s` ray target `#$A0`=160). The ball is **horizontally centered on the room**. Screen-center X = `_x + 160` → **80..264**.
- **BASE_Y = 55** — bitmap ball-center Y (`globe.s` projection `−45 + 100`). Screen-center Y = `round(fy) + 55` → **56..150**; ball bottom at floor ≈ 198.

⚠ **Absolute on-screen positions come from source, not from screen-recording measurements** (which are skewed by PAL overscan crop). The source is unambiguous: `BASE_X = 160` (ball centered on the room), floor center 150, ball bottom at floor ≈ 198 (≈2nd perspective floor row).

**Scratch-and-rebuild verdict:** No file needed a from-scratch rewrite. `ball.ts` and `room.ts` were already source-exact; `physics.ts`/`loop.ts` took targeted constant fixes (done), now fully source-derived including the screen base offsets.
