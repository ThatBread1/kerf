// ZlPanels.tsx — 3DESIGN-style side panels for the goldsmith workspace:
// silver-tabbed panes ("Strom", "Vlastnosti", "Nástroje", "Nápověda") on a
// navy gradient, a vertical feature tree and the grouped tool palette.

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, Trash2, Box } from 'lucide-react'
import { TOOL_GROUPS, type ToolDef, type ToolNode } from '../../lib/zlatnik/tools'
import { opLabel } from '../../lib/zlatnik/cs'

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
    <section className={`flex flex-col min-h-0 ${className}`} data-testid={testId} aria-label={title}>
      <div className="flex items-end justify-between gap-2 px-1.5 pt-1.5 border-b border-[#8d97b3]/70 flex-shrink-0">
        <h2 className="zl-tab px-3 py-[3px] rounded-t-md text-[12px] font-semibold tracking-wide select-none">
          {title}
        </h2>
        {actions && <div className="flex items-center gap-0.5 pb-1">{actions}</div>}
      </div>
      <div className={`flex-1 min-h-0 overflow-y-auto ${bodyClassName}`}>{children}</div>
    </section>
  )
}

/** Small square icon button used in panel headers and the properties bar. */
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
    ? 'text-emerald-300 hover:bg-emerald-400/15'
    : tone === 'danger'
      ? 'text-red-300 hover:bg-red-400/15'
      : 'text-ink-200 hover:bg-white/10 hover:text-kerf-200'
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors disabled:opacity-35 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kerf-300/70 ${toneCls}`}
    >
      {children}
    </button>
  )
}

// ── Feature tree ("Strom") ────────────────────────────────────────────────────

const BOOLEAN_NAMES: Record<string, string> = { cut: 'Odečtení', fuse: 'Sjednocení', union: 'Sjednocení', common: 'Průnik' }
const SOLID_NAMES: Record<string, string> = { sphere: 'Koule', torus: 'Torus', cylinder: 'Válec', cone: 'Kužel', box: 'Kvádr', tube: 'Trubka' }

/** Tree label: booleans and solids say what they are ("Odečtení", "Koule"). */
export function nodeLabel(node: ToolNode, fallback?: string): string {
  if (node.op === 'boolean') return BOOLEAN_NAMES[String(node.kind || 'cut')] || opLabel('boolean', fallback)
  if (node.op === 'primitive') return SOLID_NAMES[String(node.shape || 'sphere')] || opLabel('primitive', fallback)
  return opLabel(node.op, fallback)
}

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
  return (
    <div role="tree" aria-label="Strom prvků" className="py-1.5 text-[13px]" data-testid="zl-tree">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-ink-50 font-semibold hover:bg-white/5"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
        <Box size={14} className="text-kerf-300" aria-hidden="true" />
        <span className="truncate underline decoration-kerf-300/60 underline-offset-2">{fileName}</span>
      </button>
      {open && (
        <ul className="mt-0.5">
          {tree.length === 0 && (
            <li className="px-7 py-2 text-[12px] text-ink-300 italic leading-snug">
              Zatím prázdné — vyberte nástroj vpravo v panelu Nástroje.
            </li>
          )}
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
                aria-level={2}
                className={`group flex items-center gap-1 pl-5 pr-1 border-l-2 ${isSel ? 'bg-[var(--color-select)]/25 border-[var(--color-select)]' : 'border-transparent hover:bg-white/5'}`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(node.id)}
                  className={`flex-1 min-w-0 flex items-center gap-1.5 py-[5px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kerf-300/70 rounded ${off ? 'opacity-45' : ''}`}
                  data-testid={`zl-tree-item-${idx}`}
                  title={node.id}
                >
                  <span className="text-[10px] font-mono text-ink-400 w-4 text-right flex-shrink-0">{idx + 1}</span>
                  <Icon size={13} className={isSel ? 'text-kerf-200' : 'text-ink-200'} aria-hidden="true" />
                  <span className={`truncate ${isSel ? 'text-white font-medium' : 'text-ink-100'} ${off ? 'line-through' : ''}`}>
                    {nodeLabel(node, kind?.label)}
                  </span>
                </button>
                <span className={`flex items-center ${isSel ? '' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
                  <button type="button" onClick={() => onMove(node.id, 'up')} disabled={idx === 0} aria-label="Posunout výš" title="Posunout výš" className="p-0.5 rounded text-ink-300 hover:text-kerf-200 disabled:opacity-30"><ChevronUp size={12} /></button>
                  <button type="button" onClick={() => onMove(node.id, 'down')} disabled={idx === tree.length - 1} aria-label="Posunout níž" title="Posunout níž" className="p-0.5 rounded text-ink-300 hover:text-kerf-200 disabled:opacity-30"><ChevronDown size={12} /></button>
                  <button type="button" onClick={() => onToggleSuppressed(node.id)} aria-label={off ? 'Zapnout prvek' : 'Vypnout prvek'} title={off ? 'Zapnout prvek' : 'Vypnout prvek (dočasně vynechat)'} className="p-0.5 rounded text-ink-300 hover:text-kerf-200">{off ? <EyeOff size={12} /> : <Eye size={12} />}</button>
                  <button type="button" onClick={() => onDelete(node.id)} aria-label="Smazat prvek" title="Smazat prvek" className="p-0.5 rounded text-ink-300 hover:text-red-300"><Trash2 size={12} /></button>
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
  return (
    <div className="pb-3" data-testid="zl-tools" onMouseLeave={() => onHover(null)}>
      {TOOL_GROUPS.map((g) => {
        const isCollapsed = !!collapsed[g.id]
        return (
          <div key={g.id} className="pt-2">
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
              className="w-full flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-100 hover:text-kerf-200"
              aria-expanded={!isCollapsed}
            >
              <span className="flex-shrink-0">{g.label}</span>
              <span className="flex-1 h-px bg-gradient-to-r from-ink-300/60 to-transparent" aria-hidden="true" />
              {isCollapsed ? <ChevronRight size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
            </button>
            {!isCollapsed && (
              <div className="grid grid-cols-3 gap-x-1 gap-y-2 px-2 pt-2">
                {g.tools.map((t) => {
                  const need = NEEDS_BODIES[t.id] || 0
                  const disabled = bodyCount < need
                  const Icon = t.icon
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
                      className="group flex flex-col items-center gap-1 rounded-md py-1 disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kerf-300/70"
                    >
                      <span className="zl-tool w-10 h-10 rounded-full inline-flex items-center justify-center text-ink-50 group-hover:text-kerf-100 group-disabled:pointer-events-none">
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="text-[10.5px] leading-tight text-center text-ink-100 group-hover:text-white px-0.5">{t.label}</span>
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
    <div className="mx-3 mb-3 rounded-md border border-ink-600/70 bg-ink-950/35" data-testid="zl-placement">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-ink-700/70">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-100">Poloha</span>
        <button
          type="button"
          disabled={!anySet}
          onClick={() => onPatch({ place_x: 0, place_y: 0, place_z: 0, rot_x: 0, rot_y: 0, rot_z: 0, scale: 1 })}
          className="text-[10.5px] text-ink-300 hover:text-kerf-200 disabled:opacity-35"
        >
          Vynulovat
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5 p-2">
        {PLACE_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-0.5">
            <span className="text-[10px] text-ink-300">{f.label} <span className="text-ink-400">{f.unit}</span></span>
            <input
              type="number"
              step={f.step}
              value={(feature[f.key] as number | string | undefined) ?? 0}
              onChange={(e) => onPatch({ [f.key]: e.target.value === '' ? 0 : Number(e.target.value) })}
              aria-label={`${f.label} (${f.unit})`}
              className="w-full h-7 px-1.5 text-[12px] font-mono bg-ink-950/70 border border-ink-700 rounded text-ink-50 focus:outline-none focus:border-kerf-300/70"
            />
          </label>
        ))}
        <label className="flex flex-col gap-0.5 col-span-3">
          <span className="text-[10px] text-ink-300">Měřítko <span className="text-ink-400">×</span></span>
          <input
            type="number"
            step={0.05}
            min={0.01}
            value={scale as number | string}
            onChange={(e) => onPatch({ scale: e.target.value === '' ? 1 : Number(e.target.value) })}
            aria-label="Měřítko"
            className="w-full h-7 px-1.5 text-[12px] font-mono bg-ink-950/70 border border-ink-700 rounded text-ink-50 focus:outline-none focus:border-kerf-300/70"
          />
        </label>
      </div>
    </div>
  )
}
