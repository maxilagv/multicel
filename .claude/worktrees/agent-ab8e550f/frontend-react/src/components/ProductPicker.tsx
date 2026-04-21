import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

export type ProductPickerOption = {
  id: number;
  name: string;
  category_name?: string | null;
  codigo?: string | null;
  stock_quantity?: number | null;
  extra?: string | null;
};

type ProductPickerProps = {
  options: ProductPickerOption[];
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
};

function asSearchText(option: ProductPickerOption) {
  return [option.name, option.category_name || '', option.codigo || '', option.extra || '']
    .join(' ')
    .toLowerCase();
}

function buildMeta(option: ProductPickerOption) {
  const chunks: string[] = [];
  if (option.category_name) chunks.push(option.category_name);
  if (option.codigo) chunks.push(`Codigo: ${option.codigo}`);
  if (typeof option.stock_quantity === 'number') chunks.push(`Stock: ${option.stock_quantity}`);
  if (option.extra && String(option.extra).trim()) chunks.push(String(option.extra).trim());
  return chunks.join(' | ');
}

export default function ProductPicker({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar producto',
  disabled = false,
  allowClear = false,
  className = '',
  buttonClassName = '',
  panelClassName = '',
  searchPlaceholder = 'Buscar producto...',
  noResultsText = 'Sin resultados',
}: ProductPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const normalized = useMemo(() => {
    return [...(options || [])]
      .map((o) => ({
        ...o,
        id: Number(o.id),
        name: String(o.name || '').trim(),
      }))
      .filter((o) => Number.isInteger(o.id) && o.id > 0 && o.name);
  }, [options]);

  const byId = useMemo(() => {
    const map = new Map<number, ProductPickerOption>();
    for (const item of normalized) map.set(item.id, item);
    return map;
  }, [normalized]);

  const selected = value != null ? byId.get(Number(value)) || null : null;
  const selectedMeta = selected ? buildMeta(selected) : '';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return normalized;
    return normalized.filter((opt) => asSearchText(opt).includes(q));
  }, [normalized, search]);

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
        className={`input-modern text-sm w-full text-left pr-20 min-h-[2.5rem] ${buttonClassName} ${
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        {selected ? (
          <span className="block min-w-0">
            <span className="block truncate text-slate-100 font-medium leading-5">{selected.name}</span>
            {selectedMeta ? (
              <span className="block truncate text-[11px] text-slate-300 leading-4 mt-0.5">{selectedMeta}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-300">v</span>
      </button>

      {allowClear && value != null && !disabled && (
        <button
          type="button"
          className="absolute right-8 top-1/2 -translate-y-1/2 text-[11px] rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-slate-300 hover:bg-white/10"
          onClick={handleClear}
          aria-label="Limpiar producto"
        >
          Limpiar
        </button>
      )}

      {open && (
        <div
          className={`absolute z-40 mt-2 w-full rounded-xl border border-white/20 bg-slate-950 shadow-2xl ${panelClassName}`}
        >
          <div className="p-2 border-b border-white/10 bg-slate-900/80">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-modern h-9 text-sm w-full"
              placeholder={searchPlaceholder}
            />
          </div>
          <div className="max-h-80 overflow-auto app-scrollbar py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-slate-400">{noResultsText}</div>
            ) : (
              filtered.map((opt) => {
                const isSelected = Number(value) === Number(opt.id);
                const meta = buildMeta(opt);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`w-full text-left px-3 py-2.5 border-l-2 ${
                      isSelected ? 'border-cyan-400 bg-cyan-500/20' : 'border-transparent hover:bg-white/10'
                    }`}
                    onClick={() => handleSelect(Number(opt.id))}
                  >
                    <div
                      className={`truncate text-sm leading-5 ${
                        isSelected ? 'text-cyan-100 font-medium' : 'text-slate-100'
                      }`}
                    >
                      {opt.name}
                    </div>
                    {meta ? (
                      <div
                        className={`text-xs truncate leading-4 mt-0.5 ${
                          isSelected ? 'text-cyan-200/90' : 'text-slate-300'
                        }`}
                      >
                        {meta}
                      </div>
                    ) : null}
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

