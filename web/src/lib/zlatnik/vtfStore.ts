// Storage + rendering glue for models imported from 3Design (.vtf).
//
// The imported meshes are saved once, compressed, as the text content of a
// project file ("<name>.vtf-sit"). The feature tree only holds a small
// `vtf_model` node that points at that file and lists which parts are shown,
// so editing the tree never re-saves megabytes of geometry.

import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate'
import type { Mesh } from '@/types/geometry'
import type { VtfPart } from './vtf'

export interface StoredPart {
  oid: string
  name: string
  itemClass: string
  isStone: boolean
  defaultVisible: boolean
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
}

export interface VtfModelNode {
  id: string
  op: 'vtf_model'
  name?: string
  /** Id of the project file holding the packed meshes. */
  mesh_file_id: string
  /** Original file name, for display. */
  source_name?: string
  /** oids of the parts that are shown. */
  visible_parts: string[]
  suppressed?: boolean
}

const MAGIC = 'KZV1'

function toBase64(u8: Uint8Array): string {
  let s = ''
  const CH = 0x8000
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + CH)))
  return btoa(s)
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** Pack parts into a compact gzip+base64 string (normals quantized to int8). */
export function packParts(parts: VtfPart[]): string {
  const header = parts.map((p) => ({
    oid: p.oid, name: p.name, itemClass: p.itemClass, isStone: p.isStone, defaultVisible: p.defaultVisible,
    nv: p.positions.length / 3, ni: p.indices.length,
  }))
  const hdr = strToU8(JSON.stringify(header))
  let size = 8 + hdr.length
  size = (size + 3) & ~3
  for (const p of parts) size += p.positions.length * 4 + ((p.normals.length + 3) & ~3) + p.indices.length * 4
  const buf = new Uint8Array(size)
  const dv = new DataView(buf.buffer)
  buf.set(strToU8(MAGIC), 0)
  dv.setUint32(4, hdr.length, true)
  buf.set(hdr, 8)
  let o = (8 + hdr.length + 3) & ~3
  for (const p of parts) {
    new Float32Array(buf.buffer, o, p.positions.length).set(p.positions); o += p.positions.length * 4
    const q = new Int8Array(buf.buffer, o, p.normals.length)
    for (let i = 0; i < p.normals.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(p.normals[i] * 127)))
    o += (p.normals.length + 3) & ~3
    new Uint32Array(buf.buffer, o, p.indices.length).set(p.indices); o += p.indices.length * 4
  }
  return MAGIC + ':' + toBase64(gzipSync(buf, { level: 6 }))
}

export function unpackParts(text: string): StoredPart[] {
  if (!text.startsWith(MAGIC + ':')) throw new Error('Neplatná data modelu ze 3Designu.')
  const buf = gunzipSync(fromBase64(text.slice(MAGIC.length + 1)))
  const aligned = new Uint8Array(buf.length + 4)
  aligned.set(buf)
  const dv = new DataView(aligned.buffer)
  const hlen = dv.getUint32(4, true)
  const header = JSON.parse(strFromU8(aligned.subarray(8, 8 + hlen))) as {
    oid: string; name: string; itemClass: string; isStone: boolean; defaultVisible: boolean; nv: number; ni: number
  }[]
  let o = (8 + hlen + 3) & ~3
  return header.map((h) => {
    const positions = new Float32Array(aligned.buffer.slice(o, o + h.nv * 12)); o += h.nv * 12
    const q = new Int8Array(aligned.buffer, o, h.nv * 3)
    const normals = new Float32Array(h.nv * 3)
    for (let i = 0; i < normals.length; i++) normals[i] = q[i] / 127
    o += (h.nv * 3 + 3) & ~3
    const indices = new Uint32Array(aligned.buffer.slice(o, o + h.ni * 4)); o += h.ni * 4
    return { oid: h.oid, name: h.name, itemClass: h.itemClass, isStone: h.isStone, defaultVisible: h.defaultVisible, positions, normals, indices }
  })
}

// 3Design is Z-up, Kerf's viewport is Y-up: (x, y, z) -> (x, z, -y).
const zUpCache = new WeakMap<Float32Array, Float32Array>()
function zUpToYUp(a: Float32Array): Float32Array {
  let out = zUpCache.get(a)
  if (!out) {
    out = new Float32Array(a.length)
    for (let i = 0; i < a.length; i += 3) { out[i] = a[i]; out[i + 1] = a[i + 2]; out[i + 2] = -a[i + 1] }
    zUpCache.set(a, out)
  }
  return out
}

/** One imported part as a Kerf body mesh. */
export function partToMesh(node: { id: string }, p: StoredPart): Mesh {
  const tri = p.indices.length / 3
  return {
    id: `${node.id}:${p.oid}`,
    vertices: zUpToYUp(p.positions),
    indices: p.indices,
    normals: zUpToYUp(p.normals),
    faceIds: new Uint32Array(tri),
    faceMeta: [{ id: 0, planar: false, origin: [0, 0, 0], normal: [0, 0, 1], uDir: [1, 0, 0], vDir: [0, 1, 0], centroid: [0, 0, 0] }],
    edgeSegs: new Float32Array(0),
    edgeIds: new Uint32Array(0),
    edgeMap: { count: 0, edges: [] },
    faceNames: {},
    sourceNode: node.id,
    sourceOp: p.isStone ? 'gemstone' : 'vtf_model',
  } as Mesh
}

// In-memory cache: file id -> unpacked parts.
const cache = new Map<string, Promise<StoredPart[]>>()

export function loadPackedParts(fileId: string, load: () => Promise<string>): Promise<StoredPart[]> {
  let p = cache.get(fileId)
  if (!p) {
    p = load().then(unpackParts)
    p.catch(() => cache.delete(fileId))
    cache.set(fileId, p)
  }
  return p
}

export function primePackedParts(fileId: string, parts: StoredPart[]) {
  cache.set(fileId, Promise.resolve(parts))
}
