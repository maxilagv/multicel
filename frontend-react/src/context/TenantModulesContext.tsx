import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { Api } from '../lib/api';

// ── Definición de módulos toggleables ──────────────────────────────────────

export type ModuleDefinition = {
  key: string;
  label: string;
  description: string;
  group: ModuleGroup;
};

export type ModuleGroup =
  | 'Gestión comercial'
  | 'Compras e inventario'
  | 'Operaciones'
  | 'Finanzas'
  | 'Sistema';

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  // Gestión comercial
  {
    key: 'rankings',
    label: 'Rankings',
    description: 'Ranking de vendedores por volumen de ventas y margen generado.',
    group: 'Gestión comercial',
  },
  {
    key: 'crm',
    label: 'CRM',
    description: 'Seguimiento de oportunidades, contactos y actividades con clientes.',
    group: 'Gestión comercial',
  },
  {
    key: 'postventa',
    label: 'Postventa',
    description: 'Gestión de garantías, devoluciones y soporte posventa.',
    group: 'Gestión comercial',
  },
  {
    key: 'ofertas',
    label: 'Ofertas y Listas de precios',
    description: 'Listas de precios especiales y descuentos por segmento de cliente.',
    group: 'Gestión comercial',
  },
  {
    key: 'catalogo',
    label: 'Catálogo digital',
    description: 'Catálogo público compartible con clientes y lista de precios externa.',
    group: 'Gestión comercial',
  },
  {
    key: 'marketplace',
    label: 'Marketplace',
    description: 'Integración con canales de venta externos (MercadoLibre, etc.).',
    group: 'Gestión comercial',
  },

  // Compras e inventario
  {
    key: 'compras',
    label: 'Compras',
    description: 'Registro y seguimiento de órdenes de compra a proveedores.',
    group: 'Compras e inventario',
  },
  {
    key: 'proveedores',
    label: 'Proveedores',
    description: 'Gestión de proveedores, contactos y condiciones comerciales.',
    group: 'Compras e inventario',
  },
  {
    key: 'multideposito',
    label: 'Multidepósito',
    description: 'Gestión de stock distribuido en múltiples depósitos y sucursales.',
    group: 'Compras e inventario',
  },

  // Operaciones
  {
    key: 'ordenes-servicio',
    label: 'Servicio Técnico',
    description: 'Órdenes de servicio, reparaciones y seguimiento técnico.',
    group: 'Operaciones',
  },
  {
    key: 'medicina-laboral',
    label: 'Medicina Laboral',
    description: 'Carpetas de salud, exámenes médicos y archivos laborales del personal.',
    group: 'Operaciones',
  },
  {
    key: 'fabricacion',
    label: 'Fabricación',
    description: 'Producción, ensamblado de productos y control de materia prima.',
    group: 'Operaciones',
  },

  // Finanzas
  {
    key: 'arca',
    label: 'ARCA / Fiscal',
    description: 'Facturación electrónica, declaraciones fiscales y AFIP.',
    group: 'Finanzas',
  },
  {
    key: 'sueldos-vendedores',
    label: 'Sueldos de vendedores',
    description: 'Liquidación de comisiones, sueldos fijos y pagos al equipo de ventas.',
    group: 'Finanzas',
  },

  // Sistema
  {
    key: 'predicciones',
    label: 'Analisis avanzado del agente',
    description: 'Amplia el agente con analisis predictivo, alertas y recomendaciones guiadas por datos reales.',
    group: 'Sistema',
  },
  {
    key: 'aprobaciones',
    label: 'Aprobaciones',
    description: 'Flujo de aprobaciones para ventas con descuentos o condiciones especiales.',
    group: 'Sistema',
  },
  {
    key: 'alertas',
    label: 'Alertas WhatsApp',
    description: 'Notificaciones automáticas por WhatsApp para clientes y el equipo.',
    group: 'Sistema',
  },
  {
    key: 'integraciones',
    label: 'Integraciones',
    description: 'MercadoPago, MercadoLibre y otras integraciones externas.',
    group: 'Sistema',
  },
];

export const MODULE_GROUPS: ModuleGroup[] = [
  'Gestión comercial',
  'Compras e inventario',
  'Operaciones',
  'Finanzas',
  'Sistema',
];

// ── Contexto ────────────────────────────────────────────────────────────────

type TenantModulesContextType = {
  /** Record<moduleKey, enabled>. Si la clave no existe → habilitado por defecto. */
  modules: Record<string, boolean>;
  isModuleEnabled: (key: string) => boolean;
  /** Actualiza un módulo con optimistic update. Lanza error si el servidor falla. */
  setModuleEnabled: (key: string, enabled: boolean) => Promise<void>;
  loading: boolean;
  refresh: () => Promise<void>;
};

const TenantModulesContext = createContext<TenantModulesContextType>({
  modules: {},
  isModuleEnabled: () => true,
  setModuleEnabled: async () => {},
  loading: false,
  refresh: async () => {},
});

export function TenantModulesProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setModules({});
      return;
    }
    setLoading(true);
    try {
      const data = await Api.getModules();
      if (Array.isArray(data)) {
        const map: Record<string, boolean> = {};
        for (const item of data) {
          map[item.key] = item.enabled;
        }
        setModules(map);
      }
    } catch {
      // Falla silenciosamente — todos los módulos quedan habilitados por defecto
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isModuleEnabled = useCallback(
    (key: string) => {
      // Si la clave no existe en el mapa → habilitado (default seguro)
      if (!(key in modules)) return true;
      return modules[key];
    },
    [modules],
  );

  const setModuleEnabled = useCallback(
    async (key: string, enabled: boolean) => {
      const prev = modules[key] !== false; // valor anterior
      // Optimistic update inmediato
      setModules((current) => ({ ...current, [key]: enabled }));
      try {
        const allModules = MODULE_DEFINITIONS.map((def) => ({
          key: def.key,
          enabled: def.key === key ? enabled : (modules[def.key] !== false),
        }));
        await Api.setModules(allModules);
      } catch {
        // Revertir si el servidor falla
        setModules((current) => ({ ...current, [key]: prev }));
        throw new Error('No se pudo guardar el cambio. Intenta nuevamente.');
      }
    },
    [modules],
  );

  const value = useMemo(
    () => ({ modules, isModuleEnabled, setModuleEnabled, loading, refresh }),
    [modules, isModuleEnabled, setModuleEnabled, loading, refresh],
  );

  return (
    <TenantModulesContext.Provider value={value}>
      {children}
    </TenantModulesContext.Provider>
  );
}

export function useTenantModules() {
  return useContext(TenantModulesContext);
}
