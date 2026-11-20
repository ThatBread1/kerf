// Inspector for a model imported from 3Design (.vtf): rename it and choose
// which of its parts are shown (3Design keeps construction bodies too).

import { useEffect, useMemo, useState } from 'react'
import { Diamond, Eye, EyeOff, Gem, Trash2 } from 'lucide-react'
import type { StoredPart, VtfModelNode } from '../../lib/zlatnik/vtfStore'

export function VtfModelInspector({
  node,
  loadParts,
  onPatch,
  onDelete,
}: {
  node: VtfModelNode
  loadParts: (node: VtfModelNode) => Promise<StoredPart[]>
  onPatch: (patch: Partial<VtfModelNode>) => void
  onDelete: () => void
}) {
  const [parts, setParts] = useState<StoredPart[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setParts(null); setError(null)
    loadParts(node).then((p) => { if (alive) setParts(p) }).catch((e) => { if (alive) setError(String(e?.message || e)) })
    return () => { alive = false }
  }, [node.mesh_file_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => new Set(node.visible_parts || []), [node.visible_parts])
  const toggle = (oid: string) => {
    const next = new Set(visible)
    if (next.has(oid)) next.delete(oid); else next.add(oid)
    onPatch({ visible_parts: [...next] })
  }
  const setAll = (mode: 'all' | 'default' | 'none') => {
    if (!parts) return
    onPatch({
      visible_parts: mode === 'none' ? [] : parts.filter((p) => mode === 'all' || p.defaultVisible).map((p) => p.oid),
    })
  }

  return (
    <div className="flex flex-col" data-testid="zl-vtf-inspector">
      <div className="px-4 pt-1 pb-3 flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-[var(--m3-shape-md)] bg-[var(--color-m3-tertiary)] text-[#001a43] flex-shrink-0" aria-hidden="true">
          <Gem size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-[var(--color-m3-on-surface)] leading-tight">Model ze 3Designu</div>
          <div className="text-[12px] text-[var(--color-m3-on-surface-variant)] truncate" title={node.source_name}>{node.source_name || ''}</div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Odebrat model"
          title="Odebrat model"
          className="m3-btn inline-flex items-center justify-center w-8 h-8 bg-[var(--color-m3-surface-container-highest)] text-[var(--color-m3-on-surface)] hover:bg-[var(--color-m3-error-container)]"
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="px-4 pb-3 space-y-1.5">
        <label htmlFor={`vtf-name-${node.id}`} className="block text-[12px] font-medium text-[var(--color-m3-on-surface-variant)]">Název</label>
        <input
          id={`vtf-name-${node.id}`}
          type="text"
          value={node.name || ''}
          onChange={(e) => onPatch({ name: e.target.value })}
          className="w-full h-10 px-3 text-sm"
        />
      </div>

      <div className="px-4 pb-2 flex items-center justify-between gap-2">
        <div className="zl-section-label">Části modelu</div>
        {parts && <div className="text-[12px] text-[var(--color-m3-on-surface-variant)]">{visible.size} z {parts.length} zobrazeno</div>}
      </div>
      {parts && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5" role="group" aria-label="Zobrazit části">
          <button type="button" className="m3-btn m3-btn-tonal h-8 px-3 text-[12.5px] font-semibold" onClick={() => setAll('default')} title="Jen hotová tělesa (bez pomocných)">Hotová tělesa</button>
          <button type="button" className="m3-btn m3-btn-text h-8 px-3 text-[12.5px] font-semibold" onClick={() => setAll('all')}>Vše</button>
          <button type="button" className="m3-btn m3-btn-text h-8 px-3 text-[12.5px] font-semibold" onClick={() => setAll('none')}>Nic</button>
        </div>
      )}

      {error && <div className="mx-4 my-2 px-3 py-2 rounded-[var(--m3-shape-md)] bg-[var(--color-m3-error-container)] text-[#ffdad6] text-[12.5px]">{error}</div>}
      {!parts && !error && <div className="px-4 py-3 text-[13px] text-[var(--color-m3-on-surface-variant)]">Načítám části…</div>}

      {parts && (
        <ul className="px-2 pb-3 space-y-0.5" aria-label="Části modelu">
          {parts.map((p) => {
            const on = visible.has(p.oid)
            const tris = Math.round(p.indices.length / 3)
            return (
              <li key={p.oid}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => toggle(p.oid)}
                  className={`m3-list-item w-full flex items-center gap-2.5 px-3 h-11 rounded-full text-left ${on ? '' : 'opacity-60'}`}
                  title={`${p.name} — ${tris.toLocaleString('cs-CZ')} trojúhelníků${p.defaultVisible ? '' : ' (pomocné těleso)'}`}
                >
                  {on ? <Eye size={16} aria-hidden="true" className="flex-shrink-0" /> : <EyeOff size={16} aria-hidden="true" className="flex-shrink-0" />}
                  {p.isStone && <Diamond size={14} aria-hidden="true" className="flex-shrink-0 text-[var(--color-m3-tertiary)]" />}
                  <span className="truncate text-[13.5px] flex-1">{p.name}</span>
                  {!p.defaultVisible && <span className="text-[10.5px] uppercase tracking-wide opacity-70 flex-shrink-0">pomocné</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
