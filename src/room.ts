// Wireframe-room coordinates ported 1:1 from src/main.s .bgrenderloop, drawn
// at their true Amiga buffer Y (0..215) into the 320×216 framebuffer. The
// full room is visible: 13 back-wall horizontals (Y=0..192), 16 verticals,
// the 4 perspective floor rows (Y=194/197/201/207) and the front edge (Y=215).

const ROOM_Y_OFFSET = 0;

function drawLine(
  buf: Uint8Array, w: number, h: number,
  x0: number, y0: number, x1: number, y1: number,
  val: number,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) buf[y0 * w + x0] = val;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function buildRoom(buf: Uint8Array, w: number, h: number): void {
  buf.fill(0);
  const O = ROOM_Y_OFFSET;

  // Back-wall vertical bars: X = 48, 64, ..., 288 from Y=0 to Y=192.
  for (let x = 48; x < 300; x += 16) {
    drawLine(buf, w, h, x, 0 + O, x, 192 + O, 1);
  }

  // Back-wall horizontals: Y = 0, 16, ..., 200, X=48..288.
  for (let y = 0; y <= 200; y += 16) {
    drawLine(buf, w, h, 48, y + O, 288, y + O, 1);
  }

  // Perspective rays from back-wall floor (Y=192) to screen bottom (Y=215),
  // fanning out via X' = 160 + (X-160) * 1.25.
  for (let x = 48; x < 300; x += 16) {
    const xEnd = 160 + Math.trunc((x - 160) * 1.25);
    drawLine(buf, w, h, x, 192 + O, xEnd, 215 + O, 1);
  }

  // Four trapezoidal floor rows. D4 values 21, 18, 14, 8 correspond to
  // distance bands; coords match the comments in main.s .floor_rowN.
  const rows: ReadonlyArray<readonly [number, number, number]> = [
    [194, 45, 291], // D4=21 (closest)
    [197, 41, 295], // D4=18
    [201, 37, 300], // D4=14
    [207, 30, 308], // D4=8  (farthest)
  ];
  for (const [y, xL, xR] of rows) {
    drawLine(buf, w, h, xL, y + O, xR, y + O, 1);
  }

  // Floor front edge: horizontal at Y=215, X=20..319 (source main.s:884-901).
  drawLine(buf, w, h, 20, 215 + O, 319, 215 + O, 1);
}
