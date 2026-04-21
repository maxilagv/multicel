/**
 * VendedorSelector — selector de perfil de vendedor activo.
 * Persiste en localStorage bajo la clave "kaisen_active_vendedor".
 * Api.crearVenta lo inyecta automáticamente en cada venta.
 */
import { useEffect, useState, useCallback } from 'react';
import { Api } from '../lib/api';

const LS_KEY = 'kaisen_active_vendedor';

export interface VendedorPerfil {
  id: number;
  nombre: string;
  color: string;
  emoji: string | null;
}

function getStored(): VendedorPerfil | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function store(v: VendedorPerfil | null) {
  if (v) {
    localStorage.setItem(LS_KEY, JSON.stringify(v));
  } else {
    localStorage.removeItem(LS_KEY);
  }
}

// Hook público para consumir el vendedor activo
export function useActiveVendedor() {
  const [active, setActiveState] = useState<VendedorPerfil | null>(getStored);

  const setActive = useCallback((v: VendedorPerfil | null) => {
    store(v);
    setActiveState(v);
    // Disparar evento para que otros tabs/componentes sincronicen
    window.dispatchEvent(new Event('kaisen_vendedor_change'));
  }, []);

  useEffect(() => {
    const sync = () => setActiveState(getStored());
    window.addEventListener('kaisen_vendedor_change', sync);
    return () => window.removeEventListener('kaisen_vendedor_change', sync);
  }, []);

  return { active, setActive };
}

interface Props {
  /** compact: botón pill pequeño para usar en headers/barras */
  variant?: 'compact' | 'full';
  className?: string;
}

export default function VendedorSelector({ variant = 'full', className = '' }: Props) {
  const { active, setActive } = useActiveVendedor();
  const [perfiles, setPerfiles] = useState<VendedorPerfil[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (perfiles.length > 0) return;
    setLoading(true);
    try {
      const data = await Api.vendedorPerfiles();
      setPerfiles(Array.isArray(data) ? data : []);
    } catch {
      // silencioso — si falla simplemente no se muestran
    } finally {
      setLoading(false);
    }
  }, [perfiles.length]);

  const select = (v: VendedorPerfil | null) => {
    setActive(v);
    setOpen(false);
  };

  if (variant === 'compact') {
    return (
      <div className={`relative ${className}`}>
        <button
          onClick={() => { load(); setOpen(o => !o); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
          style={active ? { backgroundColor: active.color + '22', color: active.color, border: `1.5px solid ${active.color}` } : { backgroundColor: '#f3f4f6', color: '#6b7280', border: '1.5px solid #d1d5db' }}
          title={active ? `Vendedor: ${active.nombre}` : 'Seleccionar vendedor'}
        >
          {active ? (
            <>
              <span>{active.emoji || '👤'}</span>
              <span className="max-w-[100px] truncate">{active.nombre}</span>
            </>
          ) : (
            <>
              <span>👤</span>
              <span>Sin vendedor</span>
            </>
          )}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full mt-1 z-50 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
              {loading && <div className="px-4 py-3 text-sm text-gray-500">Cargando...</div>}
              <button
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-500"
                onClick={() => select(null)}
              >
                <span className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-600 flex items-center justify-center text-base">👤</span>
                <span>Sin vendedor</span>
              </button>
              {perfiles.map(v => (
                <button
                  key={v.id}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${active?.id === v.id ? 'font-semibold' : ''}`}
                  onClick={() => select(v)}
                >
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-base flex-shrink-0"
                    style={{ backgroundColor: v.color + '33' }}
                  >
                    {v.emoji || '👤'}
                  </span>
                  <span className="truncate">{v.nombre}</span>
                  {active?.id === v.id && <span className="ml-auto text-xs">✓</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // variant === 'full'
  return (
    <div className={`space-y-3 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Vendedor activo</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {/* Opción "Ninguno" */}
        <button
          onClick={() => select(null)}
          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${!active ? 'border-gray-400 bg-gray-50 dark:bg-gray-700' : 'border-transparent bg-gray-100 dark:bg-gray-800 hover:border-gray-300'}`}
        >
          <span className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xl">👤</span>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Ninguno</span>
        </button>

        {loading && (
          <div className="col-span-2 sm:col-span-3 text-center py-4 text-sm text-gray-400">Cargando perfiles...</div>
        )}

        {perfiles.map(v => (
          <button
            key={v.id}
            onClick={() => select(v)}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all"
            style={active?.id === v.id
              ? { borderColor: v.color, backgroundColor: v.color + '18' }
              : { borderColor: 'transparent', backgroundColor: v.color + '10' }
            }
          >
            <span
              className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
              style={{ backgroundColor: v.color + '33' }}
            >
              {v.emoji || '🏷️'}
            </span>
            <span className="text-xs font-semibold truncate w-full text-center" style={{ color: v.color }}>
              {v.nombre}
            </span>
            {active?.id === v.id && (
              <span className="text-xs font-bold" style={{ color: v.color }}>✓ Activo</span>
            )}
          </button>
        ))}
      </div>

      {!loading && perfiles.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-2">No hay perfiles creados</p>
      )}

      <button
        className="w-full text-xs text-indigo-500 hover:text-indigo-700 py-1"
        onClick={() => { setPerfiles([]); load(); }}
      >
        Actualizar lista
      </button>
    </div>
  );
}
