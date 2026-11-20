import { describe, it, expect } from 'vitest'
import { TOOL_GROUPS, ALL_TOOLS, RING_DEFAULTS, ringTopRadius, type ToolNode } from './tools'
import { OP_LABELS } from './cs'
import { anchorToRing, ringOuterRadius } from '../jewelryNormalize'

// The ops the in-browser OCCT worker evaluates (verified by the tool sweep in
// the goldsmith workspace work; keep in sync when adding tools).
const WORKER_OPS = new Set([
  'primitive', 'ring_shank', 'bangle', 'gemstone', 'gem_seat', 'bezel_seat', 'fishtail_seat',
  'channel_seat', 'jewelry_prong_head', 'jewelry_prong_variant', 'jewelry_head_gallery',
  'jewelry_coronet', 'jewelry_trellis_prong', 'jewelry_bezel', 'jewelry_patterned_bezel',
  'jewelry_under_bezel', 'jewelry_channel', 'jewelry_bar_channel_graduated', 'jewelry_pave',
  'jewelry_bombe_cluster', 'jewelry_peg_setting', 'jewelry_suspension_mount',
  'jewelry_vtip_protector', 'pendant', 'earrings', 'brooch', 'cufflink', 'chain_assembly',
  'boolean', 'polar_pattern', 'linear_pattern', 'mirror_pattern', 'fillet', 'chamfer',
])

let seq = 0
const newId = (op: string) => `${op}-${++seq}`
const ring: ToolNode = { id: 'ring-0', op: 'ring_shank', ...RING_DEFAULTS }

describe('goldsmith tool palette', () => {
  it('has unique tool ids and Czech labels', () => {
    const ids = ALL_TOOLS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const g of TOOL_GROUPS) expect(g.label).not.toMatch(/^[A-Z][a-z]+ [a-z]+$/) // not English placeholder
  })

  it('every tool only produces ops the browser kernel evaluates', () => {
    for (const t of ALL_TOOLS) {
      for (const ctx of [[], [ring]]) {
        const nodes = t.make({ tree: ctx, newId })
        expect(nodes.length).toBeGreaterThan(0)
        for (const n of nodes) {
          expect(WORKER_OPS.has(n.op), `${t.id} → ${n.op}`).toBe(true)
          expect(typeof n.id).toBe('string')
        }
      }
    }
  })

  it('every produced op has a Czech name', () => {
    for (const t of ALL_TOOLS) for (const n of t.make({ tree: [ring], newId })) expect(OP_LABELS[n.op], n.op).toBeTruthy()
  })

  it('solitaire builds shank → head → fuse → stone with the head anchored on the shank', () => {
    const nodes = ALL_TOOLS.find((t) => t.id === 'solitaire')!.make({ tree: [], newId })
    expect(nodes.map((n) => n.op)).toEqual(['ring_shank', 'jewelry_prong_head', 'boolean', 'gemstone'])
    const [shank, head, fuse, gem] = nodes
    expect(fuse).toMatchObject({ target_a_id: shank.id, target_b_id: head.id, kind: 'fuse' })
    expect(head.on_ring).toBe(shank.id)
    expect(gem.on_ring).toBe(shank.id)
    expect(head.rot_x).toBe(-90)
    // Resolved height: the head base sits just below the top of the shank.
    const placed = anchorToRing(head, nodes) as unknown as { place_y: number }
    expect(placed.place_y).toBeLessThan(ringOuterRadius(shank))
    expect(placed.place_y).toBeGreaterThan(ringOuterRadius(shank) - 1)
  })

  it('settings land on an existing ring; without a ring they stay at the origin', () => {
    const head = ALL_TOOLS.find((t) => t.id === 'prong-head')!
    expect(head.make({ tree: [ring], newId })[0].on_ring).toBe('ring-0')
    expect(head.make({ tree: [], newId })[0].on_ring).toBeUndefined()
  })

  it('boolean tools target the last two bodies', () => {
    const a: ToolNode = { id: 'a', op: 'primitive' }
    const b: ToolNode = { id: 'b', op: 'primitive' }
    const cut = ALL_TOOLS.find((t) => t.id === 'cut')!.make({ tree: [a, b], newId })[0]
    expect(cut).toMatchObject({ op: 'boolean', target_a_id: 'a', target_b_id: 'b', kind: 'cut' })
  })

  it('ringTopRadius follows the ring size', () => {
    const small = ringTopRadius([{ ...ring, ring_size: 50 }])!
    const big = ringTopRadius([{ ...ring, ring_size: 60 }])!
    expect(big - small).toBeCloseTo(10 / Math.PI / 2, 4)
  })
})

describe('tool targets', () => {
  it('cut seat after a solitaire cuts the fused metal, never the stone', () => {
    const sol = ALL_TOOLS.find((t) => t.id === 'solitaire')!.make({ tree: [], newId })
    const nodes = ALL_TOOLS.find((t) => t.id === 'seat-cut')!.make({ tree: sol, newId })
    const fuse = sol.find((n) => n.op === 'boolean')!
    const cut = nodes.find((n) => n.op === 'boolean')!
    expect(cut.target_a_id).toBe(fuse.id)
    expect(cut.target_b_id).toBe(nodes[0].id)
    expect(nodes[0].on_ring).toBe(sol[0].id)
  })
  it('liveBodies replaces boolean operands with the result', async () => {
    const { liveBodies, metalBodies } = await import('./tools')
    const t: ToolNode[] = [
      { id: 'r', op: 'ring_shank' }, { id: 'h', op: 'jewelry_prong_head' },
      { id: 'u', op: 'boolean', target_a_id: 'r', target_b_id: 'h', kind: 'fuse' }, { id: 'g', op: 'gemstone' },
    ]
    expect(liveBodies(t).map((n) => n.id)).toEqual(['u', 'g'])
    expect(metalBodies(t).map((n) => n.id)).toEqual(['u'])
  })
  it('Odečíst picks the metal body as A and the newest body as B', () => {
    const t: ToolNode[] = [
      { id: 'r', op: 'ring_shank' }, { id: 'g', op: 'gemstone' }, { id: 's', op: 'primitive', shape: 'sphere' },
    ]
    const cut = ALL_TOOLS.find((x) => x.id === 'cut')!.make({ tree: t, newId })[0]
    expect(cut).toMatchObject({ target_a_id: 'r', target_b_id: 's' })
  })
})
