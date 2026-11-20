// meshInfo.ts — metal volume / weight and export helpers for the goldsmith
// workspace (3DESIGN's "Informace → Hmotnost" and STL export for casting).

import * as THREE from 'three'

export interface BodyMesh {
  vertices?: Float32Array | number[] | null
  indices?: Uint32Array | number[] | null
  sourceOp?: string | null
}

/** Alloy densities in g/cm³ (typical casting-grain values). */
export const METAL_DENSITY: Record<string, number> = {
  '18k_yellow': 15.5,
  '14k_yellow': 13.1,
  '18k_white': 15.9,
  '14k_white': 12.9,
  '18k_rose': 15.1,
  '14k_rose': 13.0,
  sterling_925: 10.36,
  platinum_950: 20.7,
}

export const METAL_SHORT: Record<string, string> = {
  '18k_yellow': 'Au 750',
  '14k_yellow': 'Au 585',
  '18k_white': 'Au 750 bílé',
  '14k_white': 'Au 585 bílé',
  '18k_rose': 'Au 750 růžové',
  '14k_rose': 'Au 585 růžové',
  sterling_925: 'Ag 925',
  platinum_950: 'Pt 950',
}

/** Closed-mesh volume (mm³) by the divergence theorem. Orientation-agnostic
 *  per body (absolute value), so mixed winding between bodies is harmless. */
export function meshVolume(m: BodyMesh): number {
  const v = m.vertices
  const idx = m.indices
  if (!v || !idx || idx.length < 3) return 0
  let sum = 0
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3
    const ax = v[a], ay = v[a + 1], az = v[a + 2]
    const bx = v[b], by = v[b + 1], bz = v[b + 2]
    const cx = v[c], cy = v[c + 1], cz = v[c + 2]
    sum += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
  }
  return Math.abs(sum) / 6
}

export const isGemBody = (m: BodyMesh) => m.sourceOp === 'gemstone'

/** Total metal volume (mm³) — every body that is not a gemstone. */
export function metalVolume(bodies: BodyMesh[]): number {
  return bodies.filter((b) => !isGemBody(b)).reduce((s, b) => s + meshVolume(b), 0)
}

/** Weight in grams of `volumeMm3` of `metal`. */
export function metalWeight(volumeMm3: number, metal: string): number {
  return (volumeMm3 / 1000) * (METAL_DENSITY[metal] ?? METAL_DENSITY['18k_yellow'])
}

export function formatGrams(g: number): string {
  return `${g.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`
}

/** Indexed BufferGeometry for the exporters (STL/OBJ/3MF/GLB). */
export function bodyToGeometry(m: BodyMesh): THREE.BufferGeometry | null {
  if (!m.vertices || !m.indices || m.indices.length === 0) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(m.vertices as ArrayLike<number>), 3))
  g.setIndex(new THREE.BufferAttribute(Uint32Array.from(m.indices as ArrayLike<number>), 1))
  g.computeVertexNormals()
  return g
}
