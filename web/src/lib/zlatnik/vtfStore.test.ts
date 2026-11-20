import { describe, it, expect } from 'vitest'
import { packParts, unpackParts, partToMesh } from './vtfStore'
import { isVtf } from './vtf'

const part = {
  oid: '1:2', name: 'Klonování1', itemClass: 'ItemHEMClone', isStone: false, defaultVisible: true,
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2]),
}

describe('vtfStore', () => {
  it('packs and unpacks parts losslessly (normals quantized)', () => {
    const [p] = unpackParts(packParts([part]))
    expect(p.name).toBe('Klonování1')
    expect(Array.from(p.positions)).toEqual(Array.from(part.positions))
    expect(Array.from(p.indices)).toEqual([0, 1, 2])
    expect(p.normals[2]).toBeCloseTo(1, 2)
  })
  it('turns 3Design Z-up into Y-up and tags gems', () => {
    const m = partToMesh({ id: 'vtf-1' }, { ...part, isStone: true })
    expect(Array.from(m.vertices.slice(6, 9))).toEqual([0, 0, -1])
    expect(m.sourceOp).toBe('gemstone')
    expect(m.sourceNode).toBe('vtf-1')
  })
  it('rejects non-vtf bytes', () => {
    expect(isVtf(new Uint8Array(1000))).toBe(false)
  })
})
