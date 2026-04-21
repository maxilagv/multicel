import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { CategoryNode, FlatCategoryNode } from '../lib/categoryTree';
import { flattenCategoryTree } from '../lib/categoryTree';

type CategoryTreePickerProps = {
  tree: CategoryNode[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
  buttonClassName?: string;
  panelClassName?: string;
  searchPlaceholder?: string;
  noResultsText?: string;
  excludeIds?: Set<number>;
};

export default function CategoryTreePicker({
  tree,
  value,
  onChange,
  placeholder = 'Seleccionar categoria',
  disabled = false,
  allowClear = false,
  className = '',
  buttonClassName = '',
  panelClassName = '',
  searchPlaceholder = 'Buscar categoria...',
  noResultsText = 'Sin resultados',
  excludeIds,
}: CategoryTreePickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const allNodes = useMemo(() => flattenCategoryTree(tree || []), [tree]);

  const nodes = useMemo(() => {
    if (!excludeIds || excludeIds.size === 0) return allNodes;
    return allNodes.filter((n) => !excludeIds.has(Number(n.id)));
  }, [allNodes, excludeIds]);

  const byId = useMemo(() => {
    const map = new Map<number, FlatCategoryNode>();
    for (const n of nodes) map.set(Number(n.id), n);
    return map;
  }, [nodes]);

  const selected = value != null ? byId.get(Number(value)) || null : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((n) => {
      const name = String(n.name || '').toLowerCase();
      const path = String(n.pathLabel || '').toLowerCase();
      return name.includes(q) || path.includes(q);
    });
  }, [nodes, search]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (evt: MouseEvent | TouchEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const target = evt.target as Node | null;
      if (target && !root.contains(target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  function handleSelect(nextId: number) {
    onChange(nextId);
    setOpen(false);
    setSearch('');
  }

  function handleClear(evt: ReactMouseEvent<HTMLButtonElement>) {
    evt.preventDefault();
    evt.stopPropagation();
    onChange(null);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        className={`input-modern text-sm w-full text-left pr-20 ${buttonClassName} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selected ? 'text-slate-100' : 'text-slate-400'}>
          {selected ? selected.pathLabel : placeholder}
        </span>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">v</span>
      </button>

      {allowClear && value != null && !disabled && (
        <button
          type="button"
          className="absolute right-8 top-1/2 -translate-y-1/2 text-[11px] rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-slate-300 hover:bg-white/10"
          onClick={handleClear}
          aria-label="Limpiar categoria"
        >
          Limpiar
        </button>
      )}

      {open && (
        <div
          className={`absolute z-40 mt-2 w-full rounded-xl border border-white/15 bg-slate-950/95 shadow-2xl backdrop-blur-md ${panelClassName}`}
        >
          <div className="p-2 border-b border-white/10">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-modern h-9 text-xs w-full"
              placeholder={searchPlaceholder}
            />
          </div>
          <div className="max-h-72 overflow-auto app-scrollbar py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-500">{noResultsText}</div>
            ) : (
              filtered.map((node) => {
                const isSelected = Number(value) === Number(node.id);
                const padLeft = 12 + node.level * 16;
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/5 ${
                      isSelected ? 'bg-cyan-500/10 text-cyan-200' : 'text-slate-200'
                    }`}
                    style={{ paddingLeft: `${padLeft}px` }}
                    onClick={() => handleSelect(Number(node.id))}
                  >
                    <div className="truncate">{node.name}</div>
                    {node.level > 0 && (
                      <div className="text-[11px] text-slate-500 truncate">{node.pathLabel}</div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
