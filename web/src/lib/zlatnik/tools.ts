// tools.ts — the "Nástroje" palette of the goldsmith workspace.
//
// Groups follow 3DESIGN's Tools tab (Pevná tělesa, Vytváření, Poloha …) but
// are organised around how a goldsmith builds a piece: shank → setting →
// stone → cut the seat. Every entry produces one or more feature nodes; the
// kernel ops are the existing Kerf ones (verified to evaluate in the browser
// worker — see web/src/lib/zlatnik/tools.test.ts).
//
// Settings, seats and stones added while the file already contains a ring
// shank are placed on top of the ring automatically (rotated so their +Z
// points up out of the shank, the way 3Design's "Položit na" works).

import type { LucideIcon } from 'lucide-react'
import {
  Circle, CircleDot, Gem, Crown, Diamond, Disc, Disc3, Hexagon, Sparkles, Grid3x3,
  Link2, Anchor, Flower2, Triangle, Rows3, Pin, Orbit, Globe, Cylinder, Cone, Box,
  CircleDashed, Scissors, Combine, Repeat, Rows2, FlipHorizontal2, Squircle, Layers,
  Ribbon, Heart, Shapes,
} from 'lucide-react'
import { normalizeJewelryNode } from '../jewelryNormalize'

export type ToolNode = Record<string, unknown> & { id: string; op: string }

export interface ToolContext {
  tree: ToolNode[]
  newId: (op: string) => string
}

export interface ToolDef {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  /** Primary op (used for help text and tests). */
  op: string
  make: (ctx: ToolContext) => ToolNode[]
}

export interface ToolGroup {
  id: string
  label: string
  tools: ToolDef[]
}

// ── Ring helpers ──────────────────────────────────────────────────────────────

export const RING_DEFAULTS = {
  ring_size: 54,
  system: 'eu',
  band_width: 2.5,
  thickness: 1.6,
  profile: 'comfort_fit',
  taper_ratio: 1.0,
  shoulder_style: 'plain',
}

/** Outer radius (mm) of the last ring shank in the tree, or null. */
export function ringTopRadius(tree: ToolNode[]): number | null {
  for (let i = tree.length - 1; i >= 0; i--) {
    const n = tree[i]
    if (n.op !== 'ring_shank' || n.suppressed) continue
    const norm = normalizeJewelryNode(n)
    const od = Number(norm.outer_diameter_mm)
    if (Number.isFinite(od) && od > 0) {
      const py = Number(n.place_y) || 0
      return od / 2 + py
    }
    const id = Number(norm.inner_diameter_mm) || 17.32
    return id / 2 + (Number(norm.thickness_mm) || 1.8)
  }
  return null
}

/** Last node that produces a solid body (for modify-type tools). */
function lastBodyId(tree: ToolNode[]): string {
  for (let i = tree.length - 1; i >= 0; i--) {
    if (!tree[i].suppressed && tree[i].op !== 'boolean') return tree[i].id
  }
  return tree.length ? tree[tree.length - 1].id : ''
}

// How far a setting's base is sunk into the shank so the two fuse cleanly.
const SINK_MM = 0.4

function onRing(ctx: ToolContext, node: ToolNode, liftMm = 0): ToolNode {
  const r = ringTopRadius(ctx.tree)
  if (r == null) return node
  return { ...node, rot_x: -90, place_y: +(r - SINK_MM + liftMm).toFixed(3) }
}

const single = (op: string, defaults: Record<string, unknown> = {}, placeOnRing = false, lift = 0) =>
  (ctx: ToolContext): ToolNode[] => {
    const node: ToolNode = { id: ctx.newId(op), op, ...defaults }
    return [placeOnRing ? onRing(ctx, node, lift) : node]
  }

const solid = (shape: string, dims: Record<string, unknown>) =>
  (ctx: ToolContext): ToolNode[] => [{ id: ctx.newId('primitive'), op: 'primitive', shape, ...dims }]

// ── Presets ───────────────────────────────────────────────────────────────────

function solitairePreset(ctx: ToolContext, kind: 'prong' | 'bezel'): ToolNode[] {
  const ring: ToolNode = { id: ctx.newId('ring_shank'), op: 'ring_shank', ...RING_DEFAULTS }
  const ctx2 = { ...ctx, tree: [...ctx.tree, ring] }
  const head: ToolNode = kind === 'prong'
    ? onRing(ctx2, { id: ctx.newId('jewelry_prong_head'), op: 'jewelry_prong_head', stone_diameter: 6.5, prong_count: 6, prong_wire_diameter: 1.0, prong_height: 2.0, head_style: 'standard', basket_rail_count: 1, seat_angle_deg: 15 })
    : onRing(ctx2, { id: ctx.newId('jewelry_bezel'), op: 'jewelry_bezel', stone_diameter: 6.5, wall_thickness: 0.5, bezel_height: 3.0, bearing_ledge_height: 1.2, bezel_style: 'full', partial_opening_deg: 60, taper_angle_deg: 0 })
  const fuse: ToolNode = { id: ctx.newId('boolean'), op: 'boolean', target_a_id: ring.id, target_b_id: head.id, kind: 'fuse' }
  // Girdle height inside the setting: prong tips (4 mm head) close over the
  // crown; in a bezel the stone sits on the 1.2 mm bearing ledge.
  const gem = onRing(ctx2, { id: ctx.newId('gemstone'), op: 'gemstone', cut: 'round_brilliant', diameter_mm: 6.5, material: 'diamond' }, kind === 'prong' ? 2.5 : 2.0)
  return [ring, head, fuse, gem]
}

function cutSeatPreset(ctx: ToolContext): ToolNode[] {
  const host = lastBodyId(ctx.tree)
  const seat = onRing(ctx, { id: ctx.newId('gem_seat'), op: 'gem_seat', cut: 'round_brilliant', diameter_mm: 2.0, girdle_clearance_mm: 0.05, through_hole: false }, SINK_MM)
  const out: ToolNode[] = [seat]
  if (host) out.push({ id: ctx.newId('boolean'), op: 'boolean', target_a_id: host, target_b_id: seat.id, kind: 'cut' })
  return out
}

function booleanTool(kind: 'cut' | 'fuse' | 'common') {
  return (ctx: ToolContext): ToolNode[] => {
    const bodies = ctx.tree.filter((n) => !n.suppressed && n.op !== 'boolean')
    const a = bodies.length >= 2 ? bodies[bodies.length - 2].id : ''
    const b = bodies.length >= 1 ? bodies[bodies.length - 1].id : ''
    return [{ id: ctx.newId('boolean'), op: 'boolean', target_a_id: a, target_b_id: b, kind }]
  }
}

function modifyTool(op: string, defaults: Record<string, unknown>) {
  return (ctx: ToolContext): ToolNode[] => [{ id: ctx.newId(op), op, target_id: lastBodyId(ctx.tree), ...defaults }]
}

// ── Catalog ───────────────────────────────────────────────────────────────────

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'rings',
    label: 'Prsteny',
    tools: [
      { id: 'ring', op: 'ring_shank', label: 'Obroučka', icon: Circle,
        hint: 'Obroučka prstenu. Velikost CZ/EU = vnitřní obvod v mm (výchozí 54).',
        make: single('ring_shank', RING_DEFAULTS) },
      { id: 'solitaire', op: 'jewelry_prong_head', label: 'Solitér', icon: Gem,
        hint: 'Hotový prsten: obroučka + krapnový kotlík (6 krapen) + briliant 6,5 mm. Vše lze dál upravit ve Vlastnostech.',
        make: (ctx) => solitairePreset(ctx, 'prong') },
      { id: 'bezel-ring', op: 'jewelry_bezel', label: 'Prsten s kastlíkem', icon: CircleDot,
        hint: 'Obroučka + kastlík + briliant 6,5 mm.',
        make: (ctx) => solitairePreset(ctx, 'bezel') },
      { id: 'bangle', op: 'bangle', label: 'Náramek', icon: Orbit,
        hint: 'Pevný nebo otevřený náramek podle obvodu zápěstí.',
        make: single('bangle', { form: 'closed', wrist_size: 165, wrist_size_system: 'mm', cross_section: 'round', wire_gauge_mm: 3.0, band_width_mm: 5.0, thickness_mm: 2.0 }) },
    ],
  },
  {
    id: 'stones',
    label: 'Kameny a lůžka',
    tools: [
      { id: 'gem', op: 'gemstone', label: 'Kámen', icon: Diamond,
        hint: 'Broušený kámen. Je-li v souboru obroučka, položí se na její vrchol.',
        make: single('gemstone', { cut: 'round_brilliant', diameter_mm: 6.5, material: 'diamond' }, true, 2.5) },
      { id: 'seat-cut', op: 'gem_seat', label: 'Vyříznout lůžko', icon: Scissors,
        hint: 'Přidá frézu lůžka (2 mm) a hned ji odečte od posledního tělesa.',
        make: cutSeatPreset },
      { id: 'seat', op: 'gem_seat', label: 'Lůžko kamene', icon: Disc,
        hint: 'Fréza pro usazení kamene. Odečtěte ji Booleovskou operací.',
        make: single('gem_seat', { cut: 'round_brilliant', diameter_mm: 6.5, girdle_clearance_mm: 0.05, through_hole: false }, true, SINK_MM) },
      { id: 'bezel-seat', op: 'bezel_seat', label: 'Lůžko do kastlíku', icon: Disc3,
        hint: 'Nosná hrana uvnitř kastlíku nebo korunky.',
        make: single('bezel_seat', { cut: 'round_brilliant', diameter_mm: 6.5, girdle_clearance_mm: 0.05, tapered: false }, true, SINK_MM) },
      { id: 'fishtail-seat', op: 'fishtail_seat', label: 'Rybinové lůžko', icon: Sparkles,
        hint: 'Lůžko s rybinovým výbrusem pro drobné kameny.',
        make: single('fishtail_seat', { cut: 'round_brilliant', diameter_mm: 1.5 }, true, SINK_MM) },
      { id: 'channel-seat', op: 'channel_seat', label: 'Drážka', icon: Rows3,
        hint: 'Drážka pro řadu kamenů.',
        make: single('channel_seat', { cut: 'round_brilliant', diameter_mm: 2.0, stone_count: 5, girdle_clearance_mm: 0.05 }, true, SINK_MM) },
    ],
  },
  {
    id: 'settings',
    label: 'Kotlíky a zasazení',
    tools: [
      { id: 'prong-head', op: 'jewelry_prong_head', label: 'Krapnový kotlík', icon: Crown,
        hint: 'Kotlík se 4 nebo 6 krapnami.',
        make: single('jewelry_prong_head', { stone_diameter: 6.5, prong_count: 6, prong_wire_diameter: 1.0, prong_height: 2.0, head_style: 'standard', basket_rail_count: 1, seat_angle_deg: 15 }, true) },
      { id: 'prong-variant', op: 'jewelry_prong_variant', label: 'Tvar krapen', icon: Triangle,
        hint: 'Dvojité krapny, drápky, V-krapny, rybinové, dělené…',
        make: single('jewelry_prong_variant', {}, true) },
      { id: 'gallery', op: 'jewelry_head_gallery', label: 'Kotlík s galerií', icon: Flower2,
        hint: 'Kotlík s ozdobnou galerií.',
        make: single('jewelry_head_gallery', {}, true) },
      { id: 'coronet', op: 'jewelry_coronet', label: 'Korunka', icon: Crown,
        hint: 'Korunkové zasazení se skloněnými krapnami.',
        make: single('jewelry_coronet', {}, true) },
      { id: 'trellis', op: 'jewelry_trellis_prong', label: 'Křížené krapny', icon: Grid3x3,
        hint: 'Koš z křížených krapen.',
        make: single('jewelry_trellis_prong', {}, true) },
      { id: 'bezel', op: 'jewelry_bezel', label: 'Kastlík', icon: CircleDashed,
        hint: 'Kastlík (obruba) kolem kamene.',
        make: single('jewelry_bezel', { stone_diameter: 6.5, wall_thickness: 0.5, bezel_height: 3.0, bearing_ledge_height: 1.2, bezel_style: 'full', partial_opening_deg: 60, taper_angle_deg: 0 }, true) },
      { id: 'patterned-bezel', op: 'jewelry_patterned_bezel', label: 'Zdobený kastlík', icon: Squircle,
        hint: 'Kastlík s ozdobným okrajem.',
        make: single('jewelry_patterned_bezel', {}, true) },
      { id: 'under-bezel', op: 'jewelry_under_bezel', label: 'Podložka', icon: Layers,
        hint: 'Podložka pod kastlík nebo halo.',
        make: single('jewelry_under_bezel', {}, true) },
      { id: 'channel', op: 'jewelry_channel', label: 'Kanál', icon: Rows2,
        hint: 'Kanálové zasazení řady kamenů.',
        make: single('jewelry_channel', {}, true) },
      { id: 'bar-channel', op: 'jewelry_bar_channel_graduated', label: 'Odstupň. lišta', icon: Rows3,
        hint: 'Řada odstupňovaných kamenů s přepážkami.',
        make: single('jewelry_bar_channel_graduated', {}) },
      { id: 'pave', op: 'jewelry_pave', label: 'Pavé', icon: Sparkles,
        hint: 'Plocha drobných kamenů.',
        make: single('jewelry_pave', {}, true) },
      { id: 'bombe', op: 'jewelry_bombe_cluster', label: 'Bombé', icon: Hexagon,
        hint: 'Kopule pokrytá kameny.',
        make: single('jewelry_bombe_cluster', {}) },
      { id: 'peg', op: 'jewelry_peg_setting', label: 'Kolík', icon: Pin,
        hint: 'Kolík s miskou — náušnice, přívěsky.',
        make: single('jewelry_peg_setting', {}) },
      { id: 'suspension', op: 'jewelry_suspension_mount', label: 'Závěs', icon: Anchor,
        hint: 'Pohyblivý závěs s kroužkem.',
        make: single('jewelry_suspension_mount', {}) },
      { id: 'vtip', op: 'jewelry_vtip_protector', label: 'Krytka hrotu', icon: Triangle,
        hint: 'Krytka hrotu kapky, markýzy nebo srdce.',
        make: single('jewelry_vtip_protector', {}) },
    ],
  },
  {
    id: 'pieces',
    label: 'Šperky',
    tools: [
      { id: 'pendant', op: 'pendant', label: 'Přívěsek', icon: Heart,
        hint: 'Přívěsek s rámečkem a ouškem.',
        make: single('pendant', {}) },
      { id: 'earrings', op: 'earrings', label: 'Náušnice', icon: CircleDot,
        hint: 'Pár náušnic.',
        make: single('earrings', {}) },
      { id: 'brooch', op: 'brooch', label: 'Brož', icon: Ribbon,
        hint: 'Brož s jehlou.',
        make: single('brooch', {}) },
      { id: 'cufflink', op: 'cufflink', label: 'Knoflíček', icon: Disc,
        hint: 'Manžetový knoflíček.',
        make: single('cufflink', {}) },
      { id: 'chain', op: 'chain_assembly', label: 'Řetízek', icon: Link2,
        hint: 'Řetízek (výchozí 60 mm — prodlužte v Celkové délce).',
        make: single('chain_assembly', { style: 'cable', wire_gauge_mm: 1.0, total_length_mm: 60, open_ends: true, graduated: false }) },
    ],
  },
  {
    id: 'solids',
    label: 'Pevná tělesa',
    tools: [
      { id: 'sphere', op: 'primitive', label: 'Koule', icon: Globe, hint: 'Koule.', make: solid('sphere', { radius_mm: 2 }) },
      { id: 'torus', op: 'primitive', label: 'Torus', icon: Circle, hint: 'Torus (prstenec).', make: solid('torus', { radius_mm: 8, minor_radius_mm: 1 }) },
      { id: 'cylinder', op: 'primitive', label: 'Válec', icon: Cylinder, hint: 'Válec.', make: solid('cylinder', { radius_mm: 2, height_mm: 4 }) },
      { id: 'cone', op: 'primitive', label: 'Kužel', icon: Cone, hint: 'Kužel / komolý kužel.', make: solid('cone', { radius_mm: 2, top_radius_mm: 0, height_mm: 4 }) },
      { id: 'box', op: 'primitive', label: 'Kvádr', icon: Box, hint: 'Kvádr.', make: solid('box', { width_mm: 4, depth_mm: 4, height_mm: 4 }) },
      { id: 'tube', op: 'primitive', label: 'Trubka', icon: CircleDashed, hint: 'Trubka (dutý válec).', make: solid('tube', { radius_mm: 3, wall_mm: 0.8, height_mm: 4 }) },
    ],
  },
  {
    id: 'modify',
    label: 'Úpravy',
    tools: [
      { id: 'cut', op: 'boolean', label: 'Odečíst', icon: Scissors,
        hint: 'Odečte poslední těleso od předposledního (A − B). Tělesa lze změnit ve Vlastnostech.',
        make: booleanTool('cut') },
      { id: 'fuse', op: 'boolean', label: 'Sjednotit', icon: Combine,
        hint: 'Spojí poslední dvě tělesa v jedno.',
        make: booleanTool('fuse') },
      { id: 'common', op: 'boolean', label: 'Průnik', icon: Shapes,
        hint: 'Ponechá jen společnou část posledních dvou těles.',
        make: booleanTool('common') },
      { id: 'polar', op: 'polar_pattern', label: 'Kruhové pole', icon: Repeat,
        hint: 'Rozkopíruje poslední těleso dokola kolem osy Z.',
        make: single('polar_pattern', { axis: 'z', count: 6, total_angle_deg: 360 }) },
      { id: 'linear', op: 'linear_pattern', label: 'Řada', icon: Rows2,
        hint: 'Rozkopíruje poslední těleso v řadě.',
        make: single('linear_pattern', { direction: 'x', count: 3, spacing: 3 }) },
      { id: 'mirror', op: 'mirror_pattern', label: 'Zrcadlit', icon: FlipHorizontal2,
        hint: 'Zrcadlí poslední těleso podle roviny.',
        make: single('mirror_pattern', { plane: 'yz' }) },
      { id: 'fillet', op: 'fillet', label: 'Zaoblení', icon: Circle,
        hint: 'Zaoblí hrany posledního tělesa.',
        make: modifyTool('fillet', { edge_filter: 'all', radius: 0.3, edge_ids: [] }) },
      { id: 'chamfer', op: 'chamfer', label: 'Sražení', icon: Triangle,
        hint: 'Srazí hrany posledního tělesa.',
        make: modifyTool('chamfer', { edge_filter: 'all', distance: 0.2, edge_ids: [] }) },
    ],
  },
]

export const ALL_TOOLS: ToolDef[] = TOOL_GROUPS.flatMap((g) => g.tools)
