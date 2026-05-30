// Ball motion — a DIRECT port of the AMICUS source step (main.s .physics_x /
// .physics_y, decoded; see docs/AMICUS-SOURCE-GEOMETRY.md and the vendored
// ANIMATION-DETAILS.md §3–§5,§8–§9). Nothing here is visually tuned: every
// constant is read from the source. The wall-clock tempo comes from the
// update rate in loop.ts (one step per video field — 60 Hz, the NTSC field rate).

// Horizontal bounce box. The source limits are signed offsets from screen
// center 160: _left = -80, _right = +104 (main.s:215-217). The ball's screen
// center = _x + 160 (the bitmap ball-center X; ViewPort DxOffset = 0, screen
// LeftEdge = 0 — no scroll base), so we bake +160 in: screen X 80..264, a
// 184 px range, asymmetric exactly like the original, centered on the room.
export const LEFT_SCREEN  = 160 + -80;  // 80
export const RIGHT_SCREEN = 160 + 104;  // 264

// Vertical motion, EXACT source model (main.s .physics_y, L1505-1564). The
// physics integrates a float `fy` and the on-screen ball-center Y is
// `round(fy) + BASE_Y`:
//   fy += trunc(vy / 10)              ; integer divide — position by vy/10
//   if fy > 96: fy = 192 - fy; vy = -vy  ; floor reflect (elastic, dampy = 0)
//   vy += 1                            ; gravity (_ay = 1), applied at END
// `fy` starts at 1.0 ($80000041) and swings [1..95]; the floor threshold is the
// source's FFP `_fy > 96` (= screen-Y 150). The /10 + truncation is load-
// bearing: vy must reach 10 before the ball moves a pixel, so it hangs ~10
// steps at the apex then snaps down — the Boing gravity feel.
//
// BASE_Y = 55 is the bitmap ball-center Y (globe.s projection: -45 + 100), with
// ViewPort DyOffset = 0 / screen TopEdge = 0. So the on-screen center swings
// 56 (apex) .. 150 (floor) — a 94 px travel — and the ball bottom rests at ~198
// (≈2nd floor perspective row). Damping is dead (`_dampy = 0`, main.s:1919) so
// the bounce is perfectly elastic — same apex forever.
const VY_DIV       = 10;   // main.s: _vy / 10
const GRAVITY_STEP = 1;    // main.s: _ay = 1
const FLOOR_FY     = 96;   // main.s: reflect when _fy > 96
const FY_INIT      = 1;    // main.s: _fy = $80000041 = 1.0
const BASE_Y       = 55;   // bitmap ball-center Y (globe.s -45+100); DyOffset 0

// Exported for reference — the resulting on-screen ball-center extents.
export const APEX_Y       = FY_INIT + BASE_Y;       // 56
export const FLOOR_SCREEN = (192 - FLOOR_FY) + BASE_Y; // _fy max 96→95 ≈ 150

export type Impact = 'floor' | 'wall-left' | 'wall-right' | null;

export const ball = {
  x: 160,
  y: FY_INIT + BASE_Y,
  vx: 1,
  vy: 0,
  fy: FY_INIT,
  rotPhase: 0,
};

export function stepPhysics(): Impact {
  let impact: Impact = null;

  // Per-step order matches the source (ANIMATION-DETAILS.md §8): rotate palette,
  // Y arc, X step, then gravity LAST.

  // Rotation: palette phase steps ±1 per update, direction = sign of vx, so the
  // spin reverses at every wall bounce (main.s:1231-1236). Moving right → -1,
  // left → +1. (One full 14-phase cycle = 14 steps ≈ 0.23 s at the 60 Hz rate.)
  ball.rotPhase = ball.vx >= 0
    ? (ball.rotPhase + 13) % 14
    : (ball.rotPhase + 1)  % 14;

  // Vertical: integer-divide gravity arc on `fy`, elastic floor reflection.
  ball.fy += Math.trunc(ball.vy / VY_DIV);
  if (ball.fy > FLOOR_FY) {
    ball.fy = 2 * FLOOR_FY - ball.fy;  // 192 - fy (reflect about the floor)
    ball.vy = -ball.vy;                // elastic velocity flip
    impact  = 'floor';
  }
  ball.y = Math.round(ball.fy) + BASE_Y;  // on-screen ball-center Y

  // Horizontal: exactly ±1 px per step, elastic mirror reflection (source).
  ball.x += ball.vx;
  if (ball.x <= LEFT_SCREEN) {
    ball.x  = 2 * LEFT_SCREEN - ball.x;
    ball.vx = -ball.vx;
    impact  = 'wall-left';
  }
  if (ball.x >= RIGHT_SCREEN) {
    ball.x  = 2 * RIGHT_SCREEN - ball.x;
    ball.vx = -ball.vx;
    impact  = 'wall-right';
  }

  // Gravity applied last (source execution order).
  ball.vy += GRAVITY_STEP;

  return impact;
}
