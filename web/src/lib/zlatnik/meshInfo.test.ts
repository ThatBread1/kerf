import { describe, it, expect } from 'vitest'
import { meshVolume, metalVolume, metalWeight, formatGrams, bodyToGeometry } from './meshInfo'

// Unit cube (0..1)³ as 12 outward-facing triangles.
const cube = {
  vertices: new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1]),
  indices: new Uint32Array([0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 2,3,7, 2,7,6, 1,2,6, 1,6,5, 0,4,7, 0,7,3]),
}

describe('meshInfo', () => {
  it('computes closed-mesh volume', () => {
    expect(meshVolume(cube)).toBeCloseTo(1, 6)
  })
  it('scales: a 10 mm cube is 1000 mm³', () => {
    const big = { ...cube, vertices: cube.vertices.map((v) => v * 10) }
    expect(meshVolume(big)).toBeCloseTo(1000, 3)
  })
  it('excludes gemstones from metal volume', () => {
    expect(metalVolume([{ ...cube, sourceOp: 'ring_shank' }, { ...cube, sourceOp: 'gemstone' }])).toBeCloseTo(1, 6)
  })
  it('weighs 1 cm³ of 18k yellow at 15.5 g', () => {
    expect(metalWeight(1000, '18k_yellow')).toBeCloseTo(15.5, 6)
    expect(metalWeight(1000, 'sterling_925')).toBeCloseTo(10.36, 6)
  })
  it('formats grams the Czech way', () => {
    expect(formatGrams(2.456)).toMatch(/^2,46\s?g$/)
  })
  it('builds an indexed geometry for the exporters', () => {
    const g = bodyToGeometry(cube)!
    expect(g.getIndex()!.count).toBe(36)
    expect(g.getAttribute('position').count).toBe(8)
  })
})
