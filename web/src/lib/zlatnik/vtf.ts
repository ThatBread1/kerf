// Reader for 3Design (.vtf) documents.
//
// A .vtf file is a 512-byte header followed by records; each record is an
// int64 big-endian length plus one Java serialization stream holding one
// persistent object (a design item, a cache, the document core…). 3Design
// stores a ready-made triangle mesh for every built item ("CACHE_MESH",
// class com.type3.bridge.osg.util.CacheMesh): an int followed by a zip whose
// single entry is another Java stream with
//   float[3N] positions, int[] triangle indices (may be empty),
//   float[2N] + boolean[N] packed normals, float[2N] uv, int[] strips/fans.
// We read those meshes — the parametric history itself is not rebuilt.

import { unzipSync } from 'fflate'
import {
  annotationBytes, annotationObjects, isObject, readJavaStream, walkJava,
  type JArray, type JObject, type JValue,
} from './javaSer'

export interface VtfPart {
  /** Stable item id inside the document ("A:B" of the 3Design GUID). */
  oid: string
  /** Name shown in 3Design's tree (e.g. "Klonování10"), or a Czech fallback. */
  name: string
  /** 3Design item class, e.g. ItemHEMBooleanOp. */
  itemClass: string
  /** Gemstone (shown with gem material, excluded from metal weight). */
  isStone: boolean
  /** Our guess whether this is a final body (not consumed by a later item). */
  defaultVisible: boolean
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
}

export interface VtfDocument {
  parts: VtfPart[]
  /** Records that could not be read (kept for diagnostics). */
  skippedRecords: number
}

const CONTAINER_ITEMS = new Set(['ItemGroup', 'ItemStack', 'ItemMainPart', 'ItemPartBrep', 'ItemSectionPlan'])

function shortName(cls: string) { return cls.slice(cls.lastIndexOf('.') + 1) }

function guidKey(v: JValue): string | null {
  if (!isObject(v)) return null
  const a = v.fields.mlValA, b = v.fields.mlValB
  if (typeof a !== 'bigint' || typeof b !== 'bigint') return null
  return `${a}:${b}`
}

function arrayValues(a: JValue): JArray['values'] | null {
  return a && typeof a === 'object' && (a as JArray).kind === 'array' ? (a as JArray).values : null
}

/** HashMap entries (key, value) from java.util.HashMap's writeObject data. */
function hashMapEntries(map: JObject): [JValue, JValue][] {
  const objs = annotationObjects(map)
  const out: [JValue, JValue][] = []
  for (let i = 0; i + 1 < objs.length; i += 2) out.push([objs[i], objs[i + 1]])
  return out
}

function listElements(list: JObject): JValue[] {
  return annotationObjects(list)
}

export function vtfRecords(bytes: Uint8Array): { start: number; length: number }[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const recs: { start: number; length: number }[] = []
  let o = 0x200
  while (o + 12 <= bytes.length) {
    const n = Number(dv.getBigInt64(o))
    if (n <= 0 || o + 8 + n > bytes.length) break
    if (dv.getUint16(o + 8) !== 0xaced) break
    recs.push({ start: o + 8, length: n })
    o += 8 + n
  }
  return recs
}

export function isVtf(bytes: Uint8Array): boolean {
  return bytes.length > 0x210 && bytes[0] === 0x54 && bytes[1] === 0x63 && vtfRecords(bytes).length > 0
}

/** Decode one CacheMesh payload into positions / normals / triangle indices. */
export function decodeCacheMesh(blob: Uint8Array): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } | null {
  // int32 header, then a zip archive.
  let zipStart = -1
  for (let i = 0; i < Math.min(blob.length - 4, 64); i++) {
    if (blob[i] === 0x50 && blob[i + 1] === 0x4b && blob[i + 2] === 0x03 && blob[i + 3] === 0x04) { zipStart = i; break }
  }
  if (zipStart < 0) return null
  const files = unzipSync(blob.subarray(zipStart))
  const first = Object.values(files)[0]
  if (!first) return null
  const arrays = readJavaStream(first).map(arrayValues).filter((a): a is JArray['values'] => !!a)
  if (arrays.length < 4) return null
  const pos = arrays[0] as Float32Array
  const nVerts = Math.floor(pos.length / 3)
  if (!nVerts) return null
  const idx = arrays[1] as Int32Array
  const packedN = arrays[2] as Float32Array
  const negZ = arrays[3] as Uint8Array
  const strips = (arrays.length >= 6 ? arrays[arrays.length - 1] : new Int32Array(0)) as Int32Array

  const normals = new Float32Array(nVerts * 3)
  if (packedN.length >= nVerts * 2 && negZ.length >= nVerts) {
    for (let i = 0; i < nVerts; i++) {
      const x = packedN[2 * i], y = packedN[2 * i + 1]
      const z = Math.sqrt(Math.max(0, 1 - x * x - y * y)) * (negZ[i] ? -1 : 1)
      normals[3 * i] = x; normals[3 * i + 1] = y; normals[3 * i + 2] = z
    }
  }

  const tris: number[] = []
  const push = (a: number, b: number, c: number) => {
    if (a === b || b === c || a === c) return
    if (a >= nVerts || b >= nVerts || c >= nVerts) return
    // Skip zero-area triangles (strip joins).
    const ax = pos[3 * a], ay = pos[3 * a + 1], az = pos[3 * a + 2]
    const ux = pos[3 * b] - ax, uy = pos[3 * b + 1] - ay, uz = pos[3 * b + 2] - az
    const vx = pos[3 * c] - ax, vy = pos[3 * c + 1] - ay, vz = pos[3 * c + 2] - az
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx
    if (cx * cx + cy * cy + cz * cz < 1e-18) return
    tris.push(a, b, c)
  }
  if (idx.length >= 3) {
    for (let i = 0; i + 2 < idx.length; i += 3) push(idx[i], idx[i + 1], idx[i + 2])
  } else {
    // Positive count = triangle strip, negative count = triangle fan.
    let o = 0
    for (const s of strips) {
      const n = Math.abs(s)
      if (s > 0) {
        for (let k = 0; k < n - 2; k++) {
          if (k % 2 === 0) push(o + k, o + k + 1, o + k + 2)
          else push(o + k + 1, o + k, o + k + 2)
        }
      } else {
        for (let k = 1; k < n - 1; k++) push(o, o + k, o + k + 1)
      }
      o += n
    }
  }
  return { positions: new Float32Array(pos.subarray(0, nVerts * 3)), normals, indices: Uint32Array.from(tris) }
}

const CLASS_LABELS: Record<string, string> = {
  ItemHEMBooleanOp: 'Booleovská operace',
  ItemHEMClone: 'Klon',
  ItemHEMMirrorPlan: 'Zrcadlení',
  ItemMoveRotScale: 'Posun / otočení',
  ItemProng: 'Krapna',
  ItemStoneBuilderV2: 'Kámen',
  ItemTube: 'Trubka',
  ItemRoundBox: 'Kvádr',
  ItemHEMSplitV2: 'Rozdělení',
  ItemHEMPolyConversion: 'Převod na síť',
  ItemAdvCollectionInstancier: 'Sada kamenů',
}

/** Parse a whole .vtf document. Throws when the file is not a 3Design document. */
export function parseVtf(bytes: Uint8Array): VtfDocument {
  const recs = vtfRecords(bytes)
  if (!recs.length) throw new Error('Soubor není dokument 3Designu (.vtf).')
  const tops: (JObject | null)[] = []
  let skipped = 0
  for (const r of recs) {
    try {
      const contents = readJavaStream(bytes.subarray(r.start, r.start + r.length))
      const top = contents.find(isObject) ?? null
      tops.push(top)
    } catch {
      tops.push(null)
      skipped++
    }
  }

  // Record address -> document oid (DboRootOfDatabase.mrMapOidAdrFile).
  const addrToRec = new Map<number, number>()
  recs.forEach((r, i) => { addrToRec.set(r.start - 8, i); addrToRec.set(r.start, i) })
  const oidOfRec = new Map<number, string>()
  const names = new Map<string, string>()
  for (const top of tops) {
    if (!top) continue
    if (top.className.endsWith('DboRootOfDatabase')) {
      const map = top.fields.mrMapOidAdrFile
      if (isObject(map)) {
        for (const [k, v] of hashMapEntries(map)) {
          const key = guidKey(k)
          const addr = isObject(v) ? v.fields.value : null
          if (key && typeof addr === 'bigint') {
            const ri = addrToRec.get(Number(addr))
            if (ri != null) oidOfRec.set(ri, key)
          }
        }
      }
    }
    if (top.className.endsWith('DocumentCore')) {
      for (const o of walkJava(top)) {
        if (o.kind === 'object' && o.className === 'com.type3.document.ItemProxy') {
          const key = guidKey(o.fields.mrGuidItem)
          const nm = o.fields.mrName
          if (key && typeof nm === 'string' && nm) names.set(key, nm)
        }
      }
    }
  }

  // Items and what they reference.
  const items = new Map<string, { cls: string; refs: Set<string> }>()
  tops.forEach((top, i) => {
    if (!top) return
    const cls = shortName(top.className)
    if (!cls.startsWith('Item')) return
    const own = oidOfRec.get(i)
    if (!own) return
    const refs = new Set<string>()
    for (const o of walkJava(top)) {
      if (o.kind === 'object' && o.className === 'com.type3.document.XItem') {
        const k = guidKey(o.fields.mrOid)
        if (k && k !== own) refs.add(k)
      }
    }
    items.set(own, { cls, refs })
  })
  const consumed = new Set<string>()
  for (const it of items.values()) if (!CONTAINER_ITEMS.has(it.cls)) for (const r of it.refs) consumed.add(r)

  // Mesh caches, grouped per owning item.
  const meshesByOwner = new Map<string, { positions: Float32Array; normals: Float32Array; indices: Uint32Array }[]>()
  const order: string[] = []
  for (const top of tops) {
    if (!top || !top.className.endsWith('PersistentCacheDataMap')) continue
    for (const o of walkJava(top)) {
      if (o.kind !== 'object' || o.className !== 'java.util.HashMap') continue
      for (const [k, v] of hashMapEntries(o)) {
        if (!isObject(k) || !isObject(v) || !v.className.endsWith('CacheMesh')) continue
        const owner = guidKey(k.fields.mrGuid0)
        if (!owner) continue
        let mesh = null
        try { mesh = decodeCacheMesh(annotationBytes(v)) } catch { mesh = null }
        if (!mesh || !mesh.indices.length) continue
        if (!meshesByOwner.has(owner)) { meshesByOwner.set(owner, []); order.push(owner) }
        meshesByOwner.get(owner)!.push(mesh)
      }
    }
  }

  const parts: VtfPart[] = []
  const counters = new Map<string, number>()
  for (const owner of order) {
    const list = meshesByOwner.get(owner)!
    const merged = mergeMeshes(list)
    const it = items.get(owner)
    const cls = it?.cls ?? 'Item'
    let name = names.get(owner)
    if (!name) {
      const base = CLASS_LABELS[cls] ?? 'Těleso'
      const n = (counters.get(base) ?? 0) + 1
      counters.set(base, n)
      name = `${base} ${n}`
    }
    const isStone = /Stone|Gem/i.test(cls) || /k[aá]m(en|eny)|diamant|brilian/i.test(name)
    const defaultVisible = !!it && !consumed.has(owner) && !CONTAINER_ITEMS.has(cls)
    parts.push({ oid: owner, name, itemClass: cls, isStone, defaultVisible, ...merged })
  }
  // A document whose items we could not link still shows everything.
  if (parts.length && !parts.some((p) => p.defaultVisible)) for (const p of parts) p.defaultVisible = true
  return { parts, skippedRecords: skipped }
}

function mergeMeshes(list: { positions: Float32Array; normals: Float32Array; indices: Uint32Array }[]) {
  if (list.length === 1) return list[0]
  let nv = 0, ni = 0
  for (const m of list) { nv += m.positions.length; ni += m.indices.length }
  const positions = new Float32Array(nv), normals = new Float32Array(nv), indices = new Uint32Array(ni)
  let vo = 0, io = 0
  for (const m of list) {
    positions.set(m.positions, vo); normals.set(m.normals, vo)
    const base = vo / 3
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + base
    vo += m.positions.length; io += m.indices.length
  }
  return { positions, normals, indices }
}
