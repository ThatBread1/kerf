// jewelryNormalize.ts — expand the jewelry parameters the editor stores into
// the geometry fields the in-browser OCCT worker reads.
//
// The feature inspector (FeatureView FEATURE_KINDS) stores designer-facing
// parameters — ring size + size system, band width, stone cut + diameter —
// while the worker ops read derived geometry (inner_diameter_mm,
// girdle_radius_mm, …). On the server the Python `compute_*_params` helpers
// (packages/kerf-cad-core/.../jewelry) do this expansion; in the browser
// nothing did, so editing a ring size in the inspector had no effect on the
// model. These functions port the relevant formulas.
//
// Rule: when the designer-facing key is present it wins and the derived keys
// are recomputed from it; a node that only carries derived keys (e.g. one an
// LLM tool already expanded) passes through untouched.

type Node = Record<string, unknown>

const PI = Math.PI

// ── Ring sizes (ring.py) ─────────────────────────────────────────────────────

const UK_AU_SIZES: Record<string, number> = {
  A: 37.8, 'A½': 38.4, B: 39.1, 'B½': 39.7, C: 40.4, 'C½': 41.1, D: 41.7, 'D½': 42.4,
  E: 43.0, 'E½': 43.7, F: 44.2, 'F½': 44.8, G: 45.5, 'G½': 46.1, H: 46.8, 'H½': 47.4,
  I: 48.0, 'I½': 48.7, J: 49.3, 'J½': 50.0, K: 50.6, 'K½': 51.2, L: 51.9, 'L½': 52.5,
  M: 53.1, 'M½': 53.8, N: 54.4, 'N½': 55.1, O: 55.7, 'O½': 56.3, P: 57.0, 'P½': 57.6,
  Q: 58.3, 'Q½': 58.9, R: 59.5, 'R½': 60.2, S: 60.8, 'S½': 61.4, T: 62.1, 'T½': 62.7,
  U: 63.4, 'U½': 64.0, V: 64.6, 'V½': 65.3, W: 65.9, 'W½': 66.6, X: 67.2, 'X½': 67.8,
  Y: 68.5, 'Y½': 69.1, Z: 69.7, 'Z+1': 70.4, 'Z+2': 71.0, 'Z+3': 71.7,
}

const JP_SIZES: Record<number, number> = {
  1: 38.1, 2: 39.0, 3: 39.9, 4: 40.8, 5: 41.7, 6: 42.6, 7: 43.5, 8: 44.4, 9: 45.3, 10: 46.2,
  11: 47.1, 12: 47.9, 13: 48.8, 14: 49.7, 15: 50.6, 16: 51.5, 17: 52.4, 18: 53.3, 19: 54.2, 20: 55.1,
  21: 55.9, 22: 56.8, 23: 57.7, 24: 58.6, 25: 59.5, 26: 60.4, 27: 61.3, 28: 62.2, 29: 63.1, 30: 64.0,
}

function normaliseUkKey(size: unknown): string {
  return String(size).trim().toUpperCase().replace(/1\/2|\.5|-HALF| HALF/g, '½').replace(/\s+/g, '')
}

/**
 * Inner diameter (mm) for a ring size. `cz` and `eu` are the inner
 * circumference in mm (the Czech/European convention, e.g. 54); `mm` is an
 * explicit inner diameter. Returns null when the size can't be interpreted.
 */
export function ringSizeToInnerDiameter(system: unknown, size: unknown): number | null {
  const sys = String(system || 'us').trim().toLowerCase()
  if (size === '' || size == null) return null
  if (sys === 'us') {
    const n = Number(size)
    if (!Number.isFinite(n) || n < 0) return null
    return 11.63 + 0.8128 * n
  }
  if (sys === 'eu' || sys === 'cz') {
    const c = Number(size)
    if (!Number.isFinite(c) || c <= 0) return null
    return c / PI
  }
  if (sys === 'mm') {
    const d = Number(size)
    return Number.isFinite(d) && d > 0 ? d : null
  }
  if (sys === 'uk' || sys === 'au') {
    const c = UK_AU_SIZES[normaliseUkKey(size)]
    return c ? c / PI : null
  }
  if (sys === 'jp') {
    const c = JP_SIZES[Math.round(Number(size))]
    return c ? c / PI : null
  }
  return null
}

function num(v: unknown): number | null {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normRingShank(n: Node): Node {
  const out: Node = { ...n }
  const id = ringSizeToInnerDiameter(n.system ?? n.size_system, n.ring_size)
  const t = num(n.thickness) ?? num(n.thickness_mm)
  const w = num(n.band_width) ?? num(n.band_width_mm)
  if (t != null && t > 0) out.thickness_mm = t
  if (w != null && w > 0) out.band_width_mm = w
  if (id != null) {
    out.inner_diameter_mm = id
    out.circumference_mm = id * PI
    out.outer_diameter_mm = id + 2 * (Number(out.thickness_mm) || 1.8)
  } else if (num(n.inner_diameter_mm) != null && t != null) {
    out.outer_diameter_mm = Number(n.inner_diameter_mm) + 2 * t
  }
  return out
}

// ── Bangle (pieces.py _bangle_inner_diameter_mm) ─────────────────────────────

const US_BANGLE: Record<string, number> = { XS: 57.15, S: 60.33, M: 63.5, L: 66.68, XL: 69.85, XXL: 76.2 }

function normBangle(n: Node): Node {
  const out: Node = { ...n }
  const sys = String(n.wrist_size_system || 'mm').toLowerCase()
  let id: number | null = null
  if (n.wrist_size !== undefined && n.wrist_size !== '') {
    if (sys === 'mm') { const c = num(n.wrist_size); if (c && c > 0) id = c / PI }
    else if (sys === 'inches') { const c = num(n.wrist_size); if (c && c > 0) id = (c * 25.4) / PI }
    else if (sys === 'us') { id = US_BANGLE[String(n.wrist_size).trim().toUpperCase()] ?? null }
  }
  if (id != null) out.inner_diameter_mm = id
  const section = String(n.cross_section || 'round')
  const width = section === 'round' || section === 'square'
    ? (num(n.wire_gauge_mm) ?? num(n.band_width_mm))
    : (num(n.band_width_mm) ?? num(n.wire_gauge_mm))
  if (width != null && width > 0) out.width_mm = width
  if (section === 'round' || section === 'square') {
    const g = num(n.wire_gauge_mm)
    if (g != null && g > 0) out.thickness_mm = g
  }
  if (n.form === 'open_cuff' && num(n.opening_angle_deg) == null) out.opening_angle_deg = 30
  return out
}

// ── Gem seats (gem_seat.py seat_geometry / bezel_seat_geometry) ──────────────

// Pavilion angle / pavilion depth % / girdle % / crown angle. Brilliant-style
// values by default; step cuts are shallower with steeper crowns.
const CUT_PROPS: Record<string, [number, number, number, number]> = {
  round_brilliant: [40.75, 43.1, 3.0, 34.5],
  oval: [41, 43, 3, 34], pear: [41, 43, 3, 34], marquise: [41, 43, 3, 34], heart: [41, 43, 3, 34],
  cushion: [41, 45, 3.5, 34], radiant: [41, 45, 3.5, 34], princess: [41, 47, 3.5, 34],
  trillion: [41, 42, 3, 33],
  emerald: [45, 43, 3.5, 40], asscher: [45, 45, 3.5, 40], baguette: [45, 40, 3.5, 40],
  tapered_baguette: [45, 40, 3.5, 40], square_emerald: [45, 43, 3.5, 40],
}

function seatGeometry(n: Node) {
  const cut = String(n.cut || 'round_brilliant')
  const d = num(n.diameter_mm) ?? 6.5
  const [pavAng, pavPct, girdPct, crownAng] = CUT_PROPS[cut] || CUT_PROPS.round_brilliant
  const gClr = num(n.girdle_clearance_mm) ?? 0.05
  const culet = num(n.culet_clearance_mm) ?? 0.1
  const crownRelief = num(n.crown_relief_mm) ?? 0.3
  const rGirdle = d / 2 + gClr
  const throughHole = n.through_hole === true
  return {
    girdle_radius_mm: rGirdle,
    pavilion_depth_mm: (d * pavPct) / 100,
    pavilion_angle_deg: pavAng,
    girdle_height_mm: (d * girdPct) / 100 + 0.02,
    bearing_cone_half_angle: pavAng,
    bearing_cone_top_radius: rGirdle,
    bearing_cone_bottom_radius: d * 0.005,
    culet_depth_mm: culet,
    crown_relief_depth_mm: crownRelief,
    crown_relief_half_angle: crownAng / 2,
    through_hole: throughHole,
    through_hole_radius_mm: throughHole ? Math.max(0.3, d * 0.005) : 0,
  }
}

function normSeat(n: Node): Node {
  if (n.diameter_mm === undefined && n.cut === undefined) return n
  const out: Node = { ...n, ...seatGeometry(n) }
  if (n.op === 'bezel_seat') {
    out.inner_bore_top_radius = out.girdle_radius_mm
    if (out.inner_bore_bottom_radius === undefined) out.inner_bore_bottom_radius = out.girdle_radius_mm
  }
  return out
}

function normChannelSeat(n: Node): Node {
  if (n.diameter_mm === undefined) return n
  const d = num(n.diameter_mm) ?? 2.0
  const clr = num(n.girdle_clearance_mm) ?? 0.05
  const out: Node = { ...n, ...seatGeometry(n) }
  out.groove_width_mm = d + 2 * clr
  out.groove_depth_mm = d * 0.6 + (num(n.crown_relief_mm) ?? 0.3)
  const count = Math.max(1, Math.round(num(n.stone_count) ?? 1))
  out.groove_length_mm = count * (d + 0.1) + 2 * clr
  return out
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function normCufflink(n: Node): Node {
  const out: Node = { ...n }
  const w = num(n.face_width_mm)
  if (w != null && w > 0 && num(n.face_diameter_mm) == null) out.face_diameter_mm = w
  return out
}

function normChain(n: Node): Node {
  const out: Node = { ...n }
  const gauge = Math.max(0.1, num(n.wire_gauge_mm) ?? 1)
  const linkLen = Math.max(gauge, num(n.link_length_mm) ?? gauge * 3.5)
  const pitch = Math.max(gauge * 1.1, num(n.link_pitch_mm) ?? linkLen - 2 * gauge)
  const total = num(n.total_length_mm)
  if (total != null && total > 0 && num(n.link_count) == null) {
    // Cap so a full-length necklace stays interactive in the browser kernel.
    out.link_count = Math.max(1, Math.min(240, Math.round(total / pitch)))
  }
  return out
}

const NORMALISERS: Record<string, (n: Node) => Node> = {
  ring_shank: normRingShank,
  bangle: normBangle,
  gem_seat: normSeat,
  bezel_seat: normSeat,
  fishtail_seat: normSeat,
  channel_seat: normChannelSeat,
  cufflink: normCufflink,
  chain_assembly: normChain,
}

/** Return a copy of `node` with worker geometry fields derived from the
 *  designer-facing parameters. Unknown ops are returned unchanged. */
export function normalizeJewelryNode<T extends object>(node: T): T & Node {
  const n = node as unknown as Node
  const fn = n && typeof n.op === 'string' ? NORMALISERS[n.op] : undefined
  if (!fn) return node as T & Node
  try {
    return fn(n) as T & Node
  } catch {
    return node as T & Node
  }
}
