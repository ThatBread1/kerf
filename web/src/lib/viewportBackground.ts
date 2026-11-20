// viewportBackground.ts — the 3DESIGN-style scene backdrop: a vertical
// blue → teal-green gradient behind the model, plus matching grid colours.
import * as THREE from 'three'

/** Solid fallback (also used as the WebGL clear colour). */
export const VIEWPORT_BG = 0x14507f

/** Grid line colours that read on the gradient without shouting. */
export const GRID_MAJOR = 0x6f93b8
export const GRID_MINOR = 0x3f6b8f

const STOPS: Array<[number, string]> = [
  [0, '#0c4a82'],
  [0.55, '#1c5f7c'],
  [1, '#2f6b4c'],
]

/** A 2×256 canvas texture with the backdrop gradient (top → bottom). */
export function makeViewportGradient(): THREE.Texture | THREE.Color {
  if (typeof document === 'undefined') return new THREE.Color(VIEWPORT_BG)
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.Color(VIEWPORT_BG)
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height)
  for (const [t, c] of STOPS) g.addColorStop(t, c)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
