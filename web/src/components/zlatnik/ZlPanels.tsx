// ZlPanels.tsx — 3DESIGN-style side panels for the goldsmith workspace:
// silver-tabbed panes ("Strom", "Vlastnosti", "Nástroje", "Nápověda") on a
// navy gradient, a vertical feature tree and the grouped tool palette.

import { useRef, useState, type ReactNode, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, Trash2, Box } from 'lucide-react'
import { TOOL_GROUPS, type ToolDef, type ToolNode } from '../../lib/zlatnik/tools'
import { nodeLabel } from '../../lib/zlatnik/cs'
import { shapePolygon, TOOL_SHAPES } from '../../lib/zlatnik/m3shapes'

// ── Panel chrome ──────────────────────────────────────────────────────────────

export function ZlPanel({
  title,
  children,
  actions,
  className = '',
  bodyClassName = '',
  testId,
}: {
  title: string
  children: ReactNode
  actions?: ReactNode
  className?: string
  bodyClassName?: string
  testId?: string
}) {
  return (
    <section className={`zl-panel flex flex-col min-h-0 overflow-hidden ${className}`} data-testid={testId} aria-label={title}>
      <div className="flex items-center justify-between gap-2 pl-5 pr-2.5 pt-4 pb-2 flex-shrink-0">
        <h2 className={`zl-tab select-none truncate min-w-0 ${actions ? '!text-[18px]' : ''}`}>{title}</h2>
        {actions && <div className="flex items-center gap-0.5 flex-shrink-0">{actions}</div>}
      </div>
      <div className={`flex-1 min-h-0 overflow-y-auto ${bodyClassName}`}>{children}</div>
    </section>
  )
}

/** Round M3 icon button (36 px) for card headers; `ok` is the filled
 *  primary "Hotovo" action, the rest are tonal. */
export function ZlIconButton({
  label,
  onClick,
  disabled,
  tone = 'default',
  children,
  testId,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  tone?: 'default' | 'ok' | 'danger'
  children: ReactNode
  testId?: string
}) {
  const toneCls = tone === 'ok'
    ? 'm3-btn-filled'
    : tone === 'danger'
      ? 'bg-[var(--color-m3-surface-container-highest)] text-[var(--color-m3-on-surface)] hover:bg-[var(--color-m3-error-container)] hover:text-[#ffdad6]'
      : 'bg-[var(--color-m3-surface-container-highest)] text-[var(--color-m3-on-surface)] hover:bg-[#4a4337]'
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`m3-btn inline-flex items-center justify-center w-8 h-8 flex-shrink-0 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-m3-primary)] ${toneCls}`}
    >
      {children}
    </button>
  )
}

// ── Feature tree ("Strom") ────────────────────────────────────────────────────

export function FeatureTreePanel({
  tree,
  selectedId,
  kindByOp,
  onSelect,
  onToggleSuppressed,
  onDelete,
  onMove,
  fileName,
}: {
  tree: ToolNode[]
  selectedId: string | null
  kindByOp: Record<string, { label?: string; icon?: React.ComponentType<{ size?: number; className?: string }> }>
  onSelect: (id: string) => void
  onToggleSuppressed: (id: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, dir: 'up' | 'down') => void
  fileName: string
}) {
  const [open, setOpen] = useState(true)
  const listRef = useRef<HTMLUListElement | null>(null)
  const selIdx = tree.findIndex((n) => n.id === selectedId)
  const focusIdx = selIdx >= 0 ? selIdx : 0
  // Arrow keys / Home / End move the selection like 3Design's tree.
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (!tree.length) return
    if (e.key === 'Delete' && selIdx >= 0) { e.preventDefault(); onDelete(tree[selIdx].id); return }
    const last = tree.length - 1
    const target: Record<string, number> = {
      ArrowDown: Math.min(focusIdx + 1, last), ArrowRight: Math.min(focusIdx + 1, last),
      ArrowUp: Math.max(focusIdx - 1, 0), ArrowLeft: Math.max(focusIdx - 1, 0),
      Home: 0, End: last,
    }
    if (!(e.key in target)) return
    const next = target[e.key]
    e.preventDefault()
    onSelect(tree[next].id)
    const btns = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-tree-btn]')
    btns?.[next]?.focus()
  }
  return (
    <div className="px-2 pb-3 text-[14px]" data-testid="zl-tree">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="m3-list-item w-full flex items-center gap-2 px-3 h-10 text-[var(--color-m3-on-surface)] font-semibold"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
        <Box size={16} className="text-[var(--color-m3-primary)]" aria-hidden="true" />
        <span className="truncate">{fileName}</span>
      </button>
      {open && tree.length === 0 && (
        <p className="px-7 py-2 text-[12px] text-ink-300 italic leading-snug">
          Zatím prázdné — vyberte nástroj vpravo v panelu Nástroje.
        </p>
      )}
      {open && tree.length > 0 && (
        <ul className="mt-1 space-y-0.5" role="tree" aria-label="Strom prvků" ref={listRef} onKeyDown={onKeyDown}>
          {tree.map((node, idx) => {
            const kind = kindByOp[node.op]
            const Icon = kind?.icon || Box
            const isSel = node.id === selectedId
            const off = node.suppressed === true
            return (
              <li
                key={node.id}
                role="treeitem"
                aria-selected={isSel}
                aria-level={1}
                className="m3-list-item group flex items-center gap-1 pl-4 pr-2 h-11"
              >
                <button
                  type="button"
                  onClick={() => onSelect(node.id)}
                  className={`flex-1 min-w-0 h-full flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-m3-primary)] rounded-full ${off ? 'opacity-45' : ''}`}
                  data-testid={`zl-tree-item-${idx}`}
                  data-tree-btn=""
                  tabIndex={idx === focusIdx ? 0 : -1}
                  aria-label={`${nodeLabel(node, kind?.label)}, prvek ${idx + 1}${off ? ' (vypnuto)' : ''}`}
                  title={node.id}
                >
                  <span className={`text-[11px] font-mono w-4 text-right flex-shrink-0 ${isSel ? 'text-[#001a43]/70' : 'text-ink-400'}`}>{idx + 1}</span>
                  <Icon size={17} className={isSel ? 'text-[#001a43]' : 'text-[var(--color-m3-on-surface-variant)]'} aria-hidden="true" />
                  <span className={`truncate ${isSel ? 'text-[#001a43] font-semibold' : 'text-[var(--color-m3-on-surface)] font-medium'} ${off ? 'line-through' : ''}`}>
                    {nodeLabel(node, kind?.label)}
                  </span>
                </button>
                <span className={`flex items-center ${isSel ? '' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
                  <button type="button" onClick={() => onMove(node.id, 'up')} disabled={idx === 0} aria-label="Posunout výš" title="Posunout výš" className={`p-1 rounded-full hover:bg-black/10 ${isSel ? 'text-[#001a43]' : 'text-ink-300'} disabled:opacity-30`}><ChevronUp size={12} /></button>
                  <button type="button" onClick={() => onMove(node.id, 'down')} disabled={idx === tree.length - 1} aria-label="Posunout níž" title="Posunout níž" className={`p-1 rounded-full hover:bg-black/10 ${isSel ? 'text-[#001a43]' : 'text-ink-300'} disabled:opacity-30`}><ChevronDown size={12} /></button>
                  <button type="button" onClick={() => onToggleSuppressed(node.id)} aria-label={off ? 'Zapnout prvek' : 'Vypnout prvek'} title={off ? 'Zapnout prvek' : 'Vypnout prvek (dočasně vynechat)'} className={`p-1 rounded-full hover:bg-black/10 ${isSel ? 'text-[#001a43]' : 'text-ink-300'} disabled:opacity-30`}>{off ? <EyeOff size={12} /> : <Eye size={12} />}</button>
                  <button type="button" onClick={() => onDelete(node.id)} aria-label="Smazat prvek" title="Smazat prvek" className={`p-1 rounded-full hover:bg-black/10 ${isSel ? 'text-[#001a43]' : 'text-ink-300'} disabled:opacity-30`}><Trash2 size={12} /></button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Tool palette ("Nástroje") ─────────────────────────────────────────────────

/** Tools that need existing bodies to work on. */
const NEEDS_BODIES: Record<string, number> = {
  cut: 2, fuse: 2, common: 2, polar: 1, linear: 1, mirror: 1, fillet: 1, chamfer: 1, 'seat-cut': 1,
}

export function ToolPalette({
  bodyCount,
  onPick,
  onHover,
}: {
  bodyCount: number
  onPick: (tool: ToolDef) => void
  onHover: (tool: ToolDef | null) => void
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  let k = 0
  return (
    <div className="pb-4" data-testid="zl-tools" onMouseLeave={() => onHover(null)}>
      {TOOL_GROUPS.map((g) => {
        const isCollapsed = !!collapsed[g.id]
        return (
          <div key={g.id} className="pt-1">
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
              className="w-full flex items-center gap-2 px-5 h-8 zl-section-label hover:opacity-80"
              aria-expanded={!isCollapsed}
            >
              <span className="flex-shrink-0">{g.label}</span>
              <span className="flex-1" aria-hidden="true" />
              <span className={`transition-transform duration-300 ${isCollapsed ? '-rotate-90' : ''}`} style={{ transitionTimingFunction: 'var(--m3-spring-fast-spatial)' }}>
                <ChevronDown size={14} aria-hidden="true" />
              </span>
            </button>
            {!isCollapsed && (
              <div className="grid grid-cols-4 gap-x-1 gap-y-3 px-3 pt-1.5 pb-2">
                {g.tools.map((t) => {
                  const need = NEEDS_BODIES[t.id] || 0
                  const disabled = bodyCount < need
                  const Icon = t.icon
                  const i = k++
                  const rest = TOOL_SHAPES[i % TOOL_SHAPES.length]
                  const tone = i % 2 === 0 ? 'primary' : 'tertiary'
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => onPick(t)}
                      onMouseEnter={() => onHover(t)}
                      onFocus={() => onHover(t)}
                      title={disabled ? `${t.label} — nejdřív vytvořte ${need === 1 ? 'těleso' : 'alespoň dvě tělesa'}` : t.hint}
                      data-testid={`zl-tool-${t.id}`}
                      className="group flex flex-col items-center gap-1.5 rounded-2xl py-1 disabled:cursor-not-allowed focus-visible:outline-none"
                    >
                      <span
                        className="zl-tool w-14 h-14 inline-flex items-center justify-center"
                        data-tone={tone}
                        style={{
                          ['--shape' as string]: shapePolygon(rest),
                          ['--shape-hover' as string]: shapePolygon('circle'),
                          ['--shape-press' as string]: shapePolygon('squircle'),
                        }}
                      >
                        <Icon size={22} strokeWidth={2.1} aria-hidden="true" />
                      </span>
                      <span className={`text-[11.5px] leading-tight text-center font-medium px-0.5 ${disabled ? 'text-ink-500' : tone === 'primary' ? 'text-[var(--color-kerf-100)]' : 'text-[var(--color-m3-on-surface)]'}`}>{t.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Placement ("Poloha") ──────────────────────────────────────────────────────

const PLACE_FIELDS: Array<{ key: string; label: string; step: number; unit: string }> = [
  { key: 'place_x', label: 'Posun X', step: 0.1, unit: 'mm' },
  { key: 'place_y', label: 'Posun Y', step: 0.1, unit: 'mm' },
  { key: 'place_z', label: 'Posun Z', step: 0.1, unit: 'mm' },
  { key: 'rot_x', label: 'Otočení X', step: 5, unit: '°' },
  { key: 'rot_y', label: 'Otočení Y', step: 5, unit: '°' },
  { key: 'rot_z', label: 'Otočení Z', step: 5, unit: '°' },
]

export function PlacementSection({
  feature,
  onPatch,
}: {
  feature: Record<string, unknown>
  onPatch: (patch: Record<string, unknown>) => void
}) {
  const scale = feature.scale === undefined || feature.scale === '' ? 1 : feature.scale
  const anySet = PLACE_FIELDS.some((f) => Number(feature[f.key]) !== 0 && feature[f.key] !== undefined && feature[f.key] !== '') || Number(scale) !== 1
  return (
    <div className="mx-3 mb-4 rounded-[var(--m3-shape-lg)] bg-[var(--color-m3-surface-container-high)]" data-testid="zl-placement">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="zl-section-label">Poloha</span>
        <button
          type="button"
          disabled={!anySet}
          onClick={() => onPatch({ place_x: 0, place_y: 0, place_z: 0, rot_x: 0, rot_y: 0, rot_z: 0, scale: 1 })}
          className="m3-btn m3-btn-text px-3 h-8 text-[12px] font-semibold disabled:opacity-35"
        >
          Vynulovat
        </button>
      </div>
      {typeof feature.on_ring === 'string' && feature.on_ring && (
        <div className="mx-3 mt-1 px-3 py-2 rounded-[var(--m3-shape-md)] bg-[var(--color-m3-primary-container)] text-[11.5px] leading-snug text-[var(--color-m3-on-primary-container)] flex items-start gap-2">
          <span className="flex-1">Ukotveno na obroučce — <b>Posun Y</b> se měří od jejího vrcholu a díl se posune s ní při změně velikosti.</span>
          <button
            type="button"
            onClick={() => onPatch({ on_ring: '' })}
            className="flex-shrink-0 underline text-kerf-200 hover:text-white"
            title="Zrušit ukotvení (Posun Y bude měřen od počátku)"
          >
            Odpojit
          </button>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 px-3 pt-2 pb-3">
        {PLACE_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-0.5">
            <span className="text-[11px] text-[var(--color-m3-on-surface-variant)]">{f.label} <span className="text-ink-400">{f.unit}</span></span>
            <input
              type="number"
              step={f.step}
              value={(feature[f.key] as number | string | undefined) ?? 0}
              onChange={(e) => onPatch({ [f.key]: e.target.value === '' ? 0 : Number(e.target.value) })}
              aria-label={`${f.label} (${f.unit})`}
              className="w-full px-2.5 text-[13px] font-mono bg-ink-950/70 border border-ink-700 rounded text-ink-50 focus:outline-none focus:border-kerf-300/70"
            />
          </label>
        ))}
        <label className="flex flex-col gap-0.5 col-span-3">
          <span className="text-[11px] text-[var(--color-m3-on-surface-variant)]">Měřítko <span className="text-ink-400">×</span></span>
          <input
            type="number"
            step={0.05}
            min={0.01}
            value={scale as number | string}
            onChange={(e) => onPatch({ scale: e.target.value === '' ? 1 : Number(e.target.value) })}
            aria-label="Měřítko"
            className="w-full px-2.5 text-[13px] font-mono bg-ink-950/70 border border-ink-700 rounded text-ink-50 focus:outline-none focus:border-kerf-300/70"
          />
        </label>
      </div>
    </div>
  )
}
