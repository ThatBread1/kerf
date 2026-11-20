import { describe, it, expect } from 'vitest'
import { shapePolygon, TOOL_SHAPES } from './m3shapes'

describe('M3 shape polygons', () => {
  it('all shapes share one vertex count so clip-path can morph between them', () => {
    const counts = new Set(['circle', ...TOOL_SHAPES].map((s) => shapePolygon(s as never).split(',').length))
    expect(counts.size).toBe(1)
  })
  it('stays inside the box', () => {
    for (const s of TOOL_SHAPES) {
      for (const m of shapePolygon(s).matchAll(/(-?[\d.]+)%/g)) {
        const v = Number(m[1])
        expect(v).toBeGreaterThanOrEqual(-0.01)
        expect(v).toBeLessThanOrEqual(100.01)
      }
    }
  })
})
