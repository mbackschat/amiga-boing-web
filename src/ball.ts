export interface Vertex {
  x: number; y: number; z: number;
  color: number;
  projX: number; projY: number;
}

export const LAT_BANDS = 9;
export const LON_STEPS = 56;

const R = 80;
// Replaces the original's /512 FFP scale. 0.40 puts the projected sphere at
// ~96 native px tall, matching the frame-by-frame FS-UAE measurement of the
// original AMICUS demo (111×96, see vendor/amiga-boing/docs/ANIMATION-DETAILS.md §6).
const PROJ_SCALE = 0.40;
// Ball center within ballBuf (336×216), so there's room for positional scroll.
const PROJ_CX = 168;
const PROJ_CY = 108;

export const vertices: Vertex[] = new Array(LAT_BANDS * LON_STEPS);

// Scanline polygon filler with index-buffer output, no Canvas2D (no AA).
// Uses the standard yMin <= y < yMax edge-inclusion rule so vertices aren't
// counted twice.
function fillPolygon(
  buf: Uint8Array, w: number, h: number,
  pts: ReadonlyArray<{ projX: number; projY: number }>,
  val: number,
): void {
  if (pts.length < 3) return;
  let yMin = Infinity, yMax = -Infinity;
  for (const p of pts) {
    if (p.projY < yMin) yMin = p.projY;
    if (p.projY > yMax) yMax = p.projY;
  }
  const yStart = Math.max(0, Math.ceil(yMin));
  const yEnd   = Math.min(h - 1, Math.floor(yMax));
  const xs: number[] = [];
  for (let y = yStart; y <= yEnd; y++) {
    xs.length = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const eMin = Math.min(a.projY, b.projY);
      const eMax = Math.max(a.projY, b.projY);
      if (y < eMin || y >= eMax) continue;
      const t = (y - a.projY) / (b.projY - a.projY);
      xs.push(a.projX + t * (b.projX - a.projX));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.ceil(xs[i]));
      const x1 = Math.min(w - 1, Math.floor(xs[i + 1]));
      for (let x = x0; x <= x1; x++) buf[y * w + x] = val;
    }
  }
}

// The AMICUS drop-shadow — a DIRECT port of `globe.s` `_draw_globe` Phase A
// (L286–603), decoded from the assembly (FFP bit-patterns; see
// docs/AMICUS-SOURCE-GEOMETRY.md). Phase A draws ONE pen-1 16-vertex
// polygon, AreaEnd-filled, BEFORE the facets. It is NOT the ball outline: it is
// a plain, axis-aligned ellipse, offset right of the ball — the part the facets
// don't overpaint survives as the drop-shadow (index 1 → slot 1 grey over sky,
// slot 17 dark-magenta over the wireframe).
//
// Phase A per vertex: θ = 12° + k·22.5° (k=0..15), x = 55·cos θ + 185,
// y = (55/1.1)·sin θ + 55 = 50·sin θ + 55, in the original's 336×216 bitmap
// where the ball (Phase B) is centered at (160, 55). So relative to the ball
// center the shadow is offset (+25, 0) px, an upright ellipse with half-axes
// (55, 50). Our ballBuf is also 336×216 and our ball pixel scale matches the
// original, so these absolute numbers transfer directly about our ball center
// (PROJ_CX, PROJ_CY). Decoded constants: 185 = $B9000048, 1.1 = $8CCCCD41,
// 55 = _srad ($37), −45 = _yoff (−$2D), 12° = 2π·_angoff/360 with _angoff=12.
const SHADOW_VERTS   = 16;
const SHADOW_HX      = 55;          // _srad
const SHADOW_HY      = 55 / 1.1;    // _srad / $8CCCCD41  = 50
const SHADOW_DX      = 25;          // 185 ($B9000048) − 160 (ball center x)
const SHADOW_DY      = 0;           // both phases share y-center 55
const SHADOW_START   = (12 * Math.PI) / 180; // rot_const = 2π·_angoff/360

// AMICUS draws the facets directly on the bitmap with no co-located pen-1
// underdraw — the only pen-1 fill is this offset shadow. Drawn FIRST so the
// facets overpaint all but the offset crescent.
export function drawShadow(buf: Uint8Array, w: number, h: number): void {
  const pts: { projX: number; projY: number }[] = [];
  for (let k = 0; k < SHADOW_VERTS; k++) {
    const t = SHADOW_START + (k / SHADOW_VERTS) * 2 * Math.PI;
    pts.push({
      projX: PROJ_CX + SHADOW_DX + SHADOW_HX * Math.cos(t),
      projY: PROJ_CY + SHADOW_DY + SHADOW_HY * Math.sin(t),
    });
  }
  fillPolygon(buf, w, h, pts, 1);
}

// All facets are front-facing now (the mesh is the front hemisphere only —
// see generateVertices), so there's no back-face cull. Longitude does NOT
// wrap (lon 55→0 would be the back seam), so we draw the 55 quad columns
// between adjacent longitudes.
export function drawFacets(buf: Uint8Array, w: number, h: number): void {
  const quad: { projX: number; projY: number }[] = [
    { projX: 0, projY: 0 },
    { projX: 0, projY: 0 },
    { projX: 0, projY: 0 },
    { projX: 0, projY: 0 },
  ];
  for (let lat = 0; lat < LAT_BANDS - 1; lat++) {
    const row0 = lat * LON_STEPS;
    const row1 = (lat + 1) * LON_STEPS;
    for (let lon = 0; lon < LON_STEPS - 1; lon++) {
      const lonNext = lon + 1;
      const a = vertices[row0 + lon];
      const b = vertices[row0 + lonNext];
      const cBot = vertices[row1 + lonNext];
      const dBot = vertices[row1 + lon];
      quad[0].projX = a.projX;    quad[0].projY = a.projY;
      quad[1].projX = b.projX;    quad[1].projY = b.projY;
      quad[2].projX = cBot.projX; quad[2].projY = cBot.projY;
      quad[3].projX = dBot.projX; quad[3].projY = dBot.projY;
      fillPolygon(buf, w, h, quad, a.color);
    }
  }
}

export function generateVertices(): void {
  for (let lat = 0; lat < LAT_BANDS; lat++) {
    const theta = (lat / (LAT_BANDS - 1)) * Math.PI;
    for (let lon = 0; lon < LON_STEPS; lon++) {
      // Longitude spans [0, π] — the FRONT HEMISPHERE only, exactly like the
      // upstream `globe.s` (`v = D5·257/56`, "scaled to 0..pi"; z = sin(v)sin(u)
      // ≥ 0). Packing all 56 longitude steps into the visible 180° gives the
      // full 8 stripe-patches across the front face. (A previous port spanned
      // [0, 2π] and back-face-culled the rear, leaving only ~4 patches.)
      const phi = (lon / LON_STEPS) * Math.PI;
      const x = R * Math.sin(theta) * Math.cos(phi);
      const z = R * Math.sin(theta) * Math.sin(phi);
      const y = R * Math.cos(theta);
      // The half-cycle phase offset between adjacent latitude bands is what
      // turns the stripes into a diagonal spiral instead of horizontal rings.
      const color = ((lat & 1) * 7 + lon) % 14 + 2;
      // 1.6875 / 1.4375 come from the 68k shift-and-add rotation matrix
      // (vendor/amiga-boing/src/globe.s); they bake in a ~30° camera tilt that makes
      // the spiral visibly diagonal.
      const projX = PROJ_CX + (y / 2 + x * 1.6875) * PROJ_SCALE;
      const projY = PROJ_CY - (y * 1.4375 - x / 2) * PROJ_SCALE;
      vertices[lat * LON_STEPS + lon] = { x, y, z, color, projX, projY };
    }
  }
}
