import { describe, it, expect } from 'vitest'
import { normalizeJewelryNode, ringSizeToInnerDiameter } from './jewelryNormalize'

describe('ringSizeToInnerDiameter', () => {
  it('US sizes follow the 11.63 + 0.8128·size formula', () => {
    expect(ringSizeToInnerDiameter('us', 7)).toBeCloseTo(17.32, 2)
    expect(ringSizeToInnerDiameter('us', 0)).toBeCloseTo(11.63, 2)
  })
  it('EU / CZ sizes are the inner circumference in mm', () => {
    expect(ringSizeToInnerDiameter('eu', 54)).toBeCloseTo(54 / Math.PI, 4)
    expect(ringSizeToInnerDiameter('cz', 54)).toBeCloseTo(17.189, 3)
  })
  it('UK letters and JP numbers use the lookup tables', () => {
    expect(ringSizeToInnerDiameter('uk', 'N')).toBeCloseTo(54.4 / Math.PI, 4)
    expect(ringSizeToInnerDiameter('uk', 'n 1/2')).toBeCloseTo(55.1 / Math.PI, 4)
    expect(ringSizeToInnerDiameter('jp', 13)).toBeCloseTo(48.8 / Math.PI, 4)
  })
  it('rejects nonsense', () => {
    expect(ringSizeToInnerDiameter('us', '')).toBeNull()
    expect(ringSizeToInnerDiameter('uk', 'QQ')).toBeNull()
    expect(ringSizeToInnerDiameter('eu', -3)).toBeNull()
  })
})

describe('normalizeJewelryNode', () => {
  it('derives ring_shank geometry from the inspector fields', () => {
    const n = normalizeJewelryNode({ op: 'ring_shank', ring_size: 54, system: 'cz', band_width: 3, thickness: 1.6 })
    expect(n.inner_diameter_mm).toBeCloseTo(17.189, 3)
    expect(n.band_width_mm).toBe(3)
    expect(n.thickness_mm).toBe(1.6)
    expect(n.outer_diameter_mm).toBeCloseTo(17.189 + 3.2, 3)
  })
  it('leaves already-expanded ring nodes alone', () => {
    const n = normalizeJewelryNode({ op: 'ring_shank', inner_diameter_mm: 18, thickness_mm: 2 })
    expect(n.inner_diameter_mm).toBe(18)
  })
  it('computes gem seat radii from cut + diameter', () => {
    const n = normalizeJewelryNode({ op: 'gem_seat', cut: 'round_brilliant', diameter_mm: 4, girdle_clearance_mm: 0.05 })
    expect(n.girdle_radius_mm).toBeCloseTo(2.05, 5)
    expect(n.pavilion_depth_mm).toBeCloseTo(4 * 0.431, 5)
  })
  it('converts bangle wrist circumference to inner diameter', () => {
    const n = normalizeJewelryNode({ op: 'bangle', wrist_size: 165, wrist_size_system: 'mm', cross_section: 'round', wire_gauge_mm: 3 })
    expect(n.inner_diameter_mm).toBeCloseTo(165 / Math.PI, 4)
    expect(n.width_mm).toBe(3)
  })
  it('turns a chain length into a capped link count', () => {
    const n = normalizeJewelryNode({ op: 'chain_assembly', wire_gauge_mm: 1, total_length_mm: 60 })
    expect(n.link_count).toBe(40)
    const long = normalizeJewelryNode({ op: 'chain_assembly', wire_gauge_mm: 1, total_length_mm: 5000 })
    expect(long.link_count).toBe(240)
  })
  it('passes unknown ops through unchanged', () => {
    const node = { op: 'pad', height: 3 }
    expect(normalizeJewelryNode(node)).toBe(node)
  })
})

import { anchorToRing, ringOuterRadius } from './jewelryNormalize'

describe('anchorToRing', () => {
  const ring = { id: 'r', op: 'ring_shank', ring_size: 54, system: 'eu', thickness: 1.6, band_width: 2.5 }
  it('measures place_y from the top of the referenced shank', () => {
    const head = { id: 'h', op: 'jewelry_prong_head', on_ring: 'r', place_y: -0.4 }
    const out = anchorToRing(head, [ring, head]) as unknown as Record<string, number>
    expect(out.place_y).toBeCloseTo(ringOuterRadius(ring) - 0.4, 6)
    expect(ringOuterRadius(ring)).toBeCloseTo(54 / Math.PI / 2 + 1.6, 4)
  })
  it('follows a ring size change', () => {
    const head = { id: 'h', op: 'jewelry_prong_head', on_ring: 'r', place_y: 0 }
    const big = { ...ring, ring_size: 62 }
    const a = anchorToRing(head, [ring, head]) as unknown as Record<string, number>
    const b = anchorToRing(head, [big, head]) as unknown as Record<string, number>
    expect(b.place_y - a.place_y).toBeCloseTo((62 - 54) / Math.PI / 2, 4)
  })
  it('ignores missing or suppressed rings', () => {
    const head = { id: 'h', op: 'gemstone', on_ring: 'nope', place_y: 1 }
    expect(anchorToRing(head, [ring, head])).toBe(head)
    const off = { ...ring, suppressed: true }
    const h2 = { id: 'h', op: 'gemstone', on_ring: 'r', place_y: 1 }
    expect(anchorToRing(h2, [off, h2])).toBe(h2)
  })
})
