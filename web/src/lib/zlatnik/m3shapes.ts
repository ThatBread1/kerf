// m3shapes.ts — Material 3 Expressive shape library as CSS clip-path
// polygons. Every shape is sampled with the same number of points around the
// same angles, so the browser can interpolate between any two of them: a
// transition on `clip-path` then *morphs* the outline (cookie → circle on
// hover), which is the signature M3 Expressive interaction.

const N = 96 // samples per outline — smooth at 56 px, still cheap

export type M3Shape = 'circle' | 'square' | 'cookie4' | 'cookie6' | 'cookie9' | 'sunny' | 'squircle' | 'gem' | 'pill'

/** Radius (0..0.5 of the box) of the outline at angle t (radians). */
function radius(shape: M3Shape, t: number): number {
  switch (shape) {
    case 'circle':
      return 0.5
    case 'square':
    case 'squircle':
    case 'pill': {
      // superellipse |x|^n + |y|^n = r^n  →  r(t)
      const n = shape === 'square' ? 7 : shape === 'squircle' ? 4 : 5
      const c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t))
      return 0.5 / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n)
    }
    case 'gem': {
      // soft diamond: superellipse rotated 45°
      const u = t + Math.PI / 4
      const n = 2.4
      const c = Math.abs(Math.cos(u)), s = Math.abs(Math.sin(u))
      return 0.5 / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n)
    }
    case 'cookie4':
      return 0.5 * (0.9 + 0.1 * Math.cos(4 * t))
    case 'cookie6':
      return 0.5 * (0.91 + 0.09 * Math.cos(6 * t))
    case 'cookie9':
      return 0.5 * (0.92 + 0.08 * Math.cos(9 * t))
    case 'sunny':
      return 0.5 * (0.9 + 0.1 * Math.cos(8 * t))
  }
}

const cache = new Map<M3Shape, string>()

/** `polygon(...)` for clip-path. Points are percentages of the element box. */
export function shapePolygon(shape: M3Shape): string {
  const hit = cache.get(shape)
  if (hit) return hit
  const pts: string[] = []
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2 - Math.PI / 2
    // squircle/square/pill fill the box edge-to-edge, others leave the
    // superellipse corners rounded; clamp so nothing leaves the box.
    const r = Math.min(radius(shape, t), 0.5 / Math.max(Math.abs(Math.cos(t)), Math.abs(Math.sin(t))))
    const x = 50 + r * 100 * Math.cos(t)
    const y = 50 + r * 100 * Math.sin(t)
    pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`)
  }
  const poly = `polygon(${pts.join(',')})`
  cache.set(shape, poly)
  return poly
}

/** Rest shapes cycled across the tool palette, as in the M3E icon-button set. */
export const TOOL_SHAPES: M3Shape[] = ['circle', 'squircle', 'cookie9', 'squircle', 'cookie6', 'circle', 'gem', 'cookie4', 'sunny']
