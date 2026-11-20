// Minimal, tolerant reader for the Java Object Serialization Stream Protocol
// (java.io.ObjectOutputStream, protocol version 5).
//
// 3Design (.vtf) documents are a sequence of serialized Java objects, so this
// is all we need to pull geometry out of them. The reader never instantiates
// anything — it builds plain JS values:
//   JObject  — instance: flattened field values + all writeObject annotations
//   JArray   — array (primitive arrays become typed arrays)
//   JBlock   — raw block data written by writeObject / writeExternal
//   string, number, bigint (long), boolean, null

export interface JClassDesc {
  kind: 'classdesc'
  name: string
  flags: number
  fields: { type: string; name: string; className?: string }[]
  superDesc: JClassDesc | null
}

export interface JObject {
  kind: 'object'
  className: string
  /** Field values, sub-class first; a super-class field never overrides a sub-class one. */
  fields: Record<string, JValue>
  /** Annotation contents (writeObject/writeExternal), grouped by declaring class name. */
  annotations: { className: string; contents: JValue[] }[]
}

export interface JArray {
  kind: 'array'
  className: string
  values: JValue[] | Float32Array | Float64Array | Int32Array | Int16Array | Int8Array | Uint8Array | Uint16Array | bigint[]
}

export interface JBlock { kind: 'block'; data: Uint8Array }
export interface JEnum { kind: 'enum'; className: string; constant: string }
export interface JClass { kind: 'class'; desc: JClassDesc | null }

export type JValue = JObject | JArray | JBlock | JEnum | JClass | JClassDesc | string | number | bigint | boolean | null

const TC_NULL = 0x70
const TC_REFERENCE = 0x71
const TC_CLASSDESC = 0x72
const TC_OBJECT = 0x73
const TC_STRING = 0x74
const TC_ARRAY = 0x75
const TC_CLASS = 0x76
const TC_BLOCKDATA = 0x77
const TC_ENDBLOCKDATA = 0x78
const TC_RESET = 0x79
const TC_BLOCKDATALONG = 0x7a
const TC_LONGSTRING = 0x7c
const TC_PROXYCLASSDESC = 0x7d
const TC_ENUM = 0x7e
const BASE_HANDLE = 0x7e0000

const SC_WRITE_METHOD = 0x01
const SC_SERIALIZABLE = 0x02
const SC_EXTERNALIZABLE = 0x04
const SC_BLOCK_DATA = 0x08

const utf8 = new TextDecoder('utf-8')

export class JavaStreamReader {
  private dv: DataView
  private bytes: Uint8Array
  pos = 0
  private handles: unknown[] = []

  constructor(buf: Uint8Array) {
    this.bytes = buf
    this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  }

  get eof() { return this.pos >= this.bytes.length }

  private u8() { return this.dv.getUint8(this.pos++) }
  private i8() { return this.dv.getInt8(this.pos++) }
  private u16() { const v = this.dv.getUint16(this.pos); this.pos += 2; return v }
  private i16() { const v = this.dv.getInt16(this.pos); this.pos += 2; return v }
  private i32() { const v = this.dv.getInt32(this.pos); this.pos += 4; return v }
  private i64() { const v = this.dv.getBigInt64(this.pos); this.pos += 8; return v }
  private f32() { const v = this.dv.getFloat32(this.pos); this.pos += 4; return v }
  private f64() { const v = this.dv.getFloat64(this.pos); this.pos += 8; return v }
  private take(n: number) {
    if (n < 0 || this.pos + n > this.bytes.length) throw new Error('java stream: read past end')
    const s = this.bytes.subarray(this.pos, this.pos + n)
    this.pos += n
    return s
  }
  private utf() { return utf8.decode(this.take(this.u16())) }
  private longUtf() { return utf8.decode(this.take(Number(this.i64()))) }

  private newHandle(v: unknown) { this.handles.push(v); return this.handles.length - 1 }

  /** Read the stream header. */
  header() {
    if (this.u16() !== 0xaced) throw new Error('not a Java serialization stream')
    this.u16()
  }

  /** Read every top-level content item until the end of the buffer. */
  readAll(): JValue[] {
    const out: JValue[] = []
    while (!this.eof) {
      const v = this.content(true)
      if (v !== undefined) out.push(v as JValue)
    }
    return out
  }

  /** One content item. Returns `undefined` for TC_ENDBLOCKDATA / TC_RESET. */
  content(allowBlock: boolean): JValue | undefined {
    const tc = this.u8()
    switch (tc) {
      case TC_NULL: return null
      case TC_REFERENCE: {
        const h = this.i32() - BASE_HANDLE
        if (h < 0 || h >= this.handles.length) throw new Error('java stream: bad handle')
        return this.handles[h] as JValue
      }
      case TC_CLASSDESC: case TC_PROXYCLASSDESC: { this.pos--; return this.classDesc() }
      case TC_OBJECT: return this.object()
      case TC_STRING: { const s = this.utf(); this.newHandle(s); return s }
      case TC_LONGSTRING: { const s = this.longUtf(); this.newHandle(s); return s }
      case TC_ARRAY: return this.array()
      case TC_CLASS: { const desc = this.classDesc(); const c: JClass = { kind: 'class', desc }; this.newHandle(c); return c }
      case TC_ENUM: {
        const desc = this.classDesc()
        const e: JEnum = { kind: 'enum', className: desc?.name ?? '?', constant: '' }
        this.newHandle(e)
        e.constant = String(this.content(false) ?? '')
        return e
      }
      case TC_BLOCKDATA: case TC_BLOCKDATALONG: {
        const n = tc === TC_BLOCKDATA ? this.u8() : this.i32()
        const b: JBlock = { kind: 'block', data: this.take(n) }
        if (!allowBlock) return b
        return b
      }
      case TC_ENDBLOCKDATA: return undefined
      case TC_RESET: this.handles = []; return undefined
      default: throw new Error(`java stream: unknown type code 0x${tc.toString(16)} at ${this.pos - 1}`)
    }
  }

  private classDesc(): JClassDesc | null {
    const tc = this.u8()
    if (tc === TC_NULL) return null
    if (tc === TC_REFERENCE) { this.pos--; return this.content(false) as JClassDesc }
    if (tc === TC_PROXYCLASSDESC) {
      const desc: JClassDesc = { kind: 'classdesc', name: '$Proxy', flags: SC_SERIALIZABLE, fields: [], superDesc: null }
      this.newHandle(desc)
      const n = this.i32()
      for (let i = 0; i < n; i++) this.utf()
      this.skipAnnotation()
      desc.superDesc = this.classDesc()
      return desc
    }
    if (tc !== TC_CLASSDESC) throw new Error(`java stream: expected class descriptor, got 0x${tc.toString(16)}`)
    const name = this.utf()
    this.i64() // serialVersionUID
    const desc: JClassDesc = { kind: 'classdesc', name, flags: 0, fields: [], superDesc: null }
    this.newHandle(desc)
    desc.flags = this.u8()
    const count = this.u16()
    for (let i = 0; i < count; i++) {
      const type = String.fromCharCode(this.u8())
      const fname = this.utf()
      let className: string | undefined
      if (type === 'L' || type === '[') className = String(this.content(false))
      desc.fields.push({ type, name: fname, className })
    }
    this.skipAnnotation()
    desc.superDesc = this.classDesc()
    return desc
  }

  private skipAnnotation() { this.annotation() }

  /** Contents up to (and consuming) TC_ENDBLOCKDATA. */
  private annotation(): JValue[] {
    const out: JValue[] = []
    for (;;) {
      if (this.eof) return out
      const v = this.content(true)
      if (v === undefined) {
        // TC_ENDBLOCKDATA (or a reset) ends the annotation.
        if (this.bytes[this.pos - 1] === TC_ENDBLOCKDATA) return out
        continue
      }
      out.push(v)
    }
  }

  private object(): JObject {
    const desc = this.classDesc()
    const obj: JObject = { kind: 'object', className: desc?.name ?? '?', fields: {}, annotations: [] }
    this.newHandle(obj)
    // Class hierarchy, top-most super class first.
    const chain: JClassDesc[] = []
    for (let d = desc; d; d = d.superDesc) chain.unshift(d)
    const perClass: Record<string, JValue>[] = []
    for (const d of chain) {
      const vals: Record<string, JValue> = {}
      if (d.flags & SC_EXTERNALIZABLE) {
        if (d.flags & SC_BLOCK_DATA) obj.annotations.push({ className: d.name, contents: this.annotation() })
        continue
      }
      if (d.flags & SC_SERIALIZABLE) {
        for (const f of d.fields) vals[f.name] = this.fieldValue(f.type)
        if (d.flags & SC_WRITE_METHOD) obj.annotations.push({ className: d.name, contents: this.annotation() })
      }
      perClass.push(vals)
    }
    // Sub-class fields win over same-named super-class fields.
    for (let i = perClass.length - 1; i >= 0; i--) {
      for (const [k, v] of Object.entries(perClass[i])) if (!(k in obj.fields)) obj.fields[k] = v
    }
    return obj
  }

  private fieldValue(type: string): JValue {
    switch (type) {
      case 'B': return this.i8()
      case 'C': return String.fromCharCode(this.u16())
      case 'D': return this.f64()
      case 'F': return this.f32()
      case 'I': return this.i32()
      case 'J': return this.i64()
      case 'S': return this.i16()
      case 'Z': return this.u8() !== 0
      default: {
        const v = this.content(false)
        return v === undefined ? null : v
      }
    }
  }

  private array(): JArray {
    const desc = this.classDesc()
    const className = desc?.name ?? '['
    const arr: JArray = { kind: 'array', className, values: [] }
    this.newHandle(arr)
    const n = this.i32()
    if (n < 0 || n > 200_000_000) throw new Error('java stream: bad array length')
    const t = className.charAt(1)
    const be = (bytesPer: number) => this.take(n * bytesPer)
    switch (t) {
      case 'F': { const src = be(4); const out = new Float32Array(n); const dv = new DataView(src.buffer, src.byteOffset, src.byteLength); for (let i = 0; i < n; i++) out[i] = dv.getFloat32(i * 4); arr.values = out; break }
      case 'D': { const src = be(8); const out = new Float64Array(n); const dv = new DataView(src.buffer, src.byteOffset, src.byteLength); for (let i = 0; i < n; i++) out[i] = dv.getFloat64(i * 8); arr.values = out; break }
      case 'I': { const src = be(4); const out = new Int32Array(n); const dv = new DataView(src.buffer, src.byteOffset, src.byteLength); for (let i = 0; i < n; i++) out[i] = dv.getInt32(i * 4); arr.values = out; break }
      case 'S': { const src = be(2); const out = new Int16Array(n); const dv = new DataView(src.buffer, src.byteOffset, src.byteLength); for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2); arr.values = out; break }
      case 'C': { const src = be(2); const out = new Uint16Array(n); const dv = new DataView(src.buffer, src.byteOffset, src.byteLength); for (let i = 0; i < n; i++) out[i] = dv.getUint16(i * 2); arr.values = out; break }
      case 'J': { const out: bigint[] = []; for (let i = 0; i < n; i++) out.push(this.i64()); arr.values = out; break }
      case 'B': arr.values = new Int8Array(be(1).slice().buffer); break
      case 'Z': arr.values = be(1).slice(); break
      default: {
        const out: JValue[] = []
        for (let i = 0; i < n; i++) { const v = this.content(false); out.push(v === undefined ? null : v) }
        arr.values = out
      }
    }
    return arr
  }
}

/** Parse one complete serialization stream; returns its top-level contents. */
export function readJavaStream(buf: Uint8Array): JValue[] {
  const r = new JavaStreamReader(buf)
  r.header()
  return r.readAll()
}

export function isObject(v: unknown): v is JObject {
  return !!v && typeof v === 'object' && (v as JObject).kind === 'object'
}

/** Depth-first walk over every object/array reachable from `root` (each visited once). */
export function* walkJava(root: JValue): Generator<JObject | JArray> {
  const seen = new Set<unknown>()
  const stack: unknown[] = [root]
  while (stack.length) {
    const v = stack.pop()
    if (!v || typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    const k = (v as { kind?: string }).kind
    if (k === 'object') {
      const o = v as JObject
      yield o
      for (const fv of Object.values(o.fields)) stack.push(fv)
      for (const a of o.annotations) for (const c of a.contents) stack.push(c)
    } else if (k === 'array') {
      const a = v as JArray
      yield a
      if (Array.isArray(a.values)) for (const x of a.values) stack.push(x)
    }
  }
}

/** Every non-block item of an object's annotations, in order. */
export function annotationObjects(o: JObject): JValue[] {
  const out: JValue[] = []
  for (const a of o.annotations) for (const c of a.contents) {
    if (c && typeof c === 'object' && (c as JBlock).kind === 'block') continue
    out.push(c)
  }
  return out
}

/** Concatenated block data of an object's annotations. */
export function annotationBytes(o: JObject): Uint8Array {
  const parts: Uint8Array[] = []
  for (const a of o.annotations) for (const c of a.contents) {
    if (c && typeof c === 'object' && (c as JBlock).kind === 'block') parts.push((c as JBlock).data)
  }
  let n = 0
  for (const p of parts) n += p.length
  const out = new Uint8Array(n)
  let o2 = 0
  for (const p of parts) { out.set(p, o2); o2 += p.length }
  return out
}
