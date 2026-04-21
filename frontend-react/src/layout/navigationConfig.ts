import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bell,
  Boxes,
  Brain,
  Building2,
  ClipboardCheck,
  FileBarChart2,
  FlaskConical,
  HeartPulse,
  Handshake,
  Keyboard,
  LayoutDashboard,
  Link2,
  Package,
  ReceiptText,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tags,
  Trophy,
  Truck,
  UserRoundCog,
  UsersRound,
  Wallet,
  Wrench,
} from 'lucide-react';
import type { FeatureKey } from '../lib/features';
import { hasFeature } from '../lib/features';

export type NavItem = {
  to: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  roles: string[];
  feature?: FeatureKey;
  /** Clave del módulo para el toggle admin por tenant. Ausente = no toggleable (core). */
  moduleKey?: string;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Principal',
    items: [
      { to: '/app/dashboard',  label: 'Dashboard',  shortLabel: 'Inicio',    icon: LayoutDashboard, roles: ['admin', 'gerente', 'vendedor'] },
      { to: '/app/mi-sucursal', label: 'Mi sucursal', shortLabel: 'Sucursal', icon: Building2, roles: ['gerente_sucursal'], feature: 'multideposito', moduleKey: 'multideposito' },
      { to: '/app/clientes',   label: 'Clientes',   shortLabel: 'Clientes',  icon: UsersRound,      roles: ['admin', 'gerente', 'gerente_sucursal', 'vendedor'] },
      { to: '/app/productos',  label: 'Productos',  shortLabel: 'Productos', icon: Package,         roles: ['admin', 'gerente', 'vendedor'] },
      { to: '/app/mi-cuenta/comisiones', label: 'Mis comisiones', shortLabel: 'Comisiones', icon: Wallet, roles: ['vendedor'], feature: 'usuarios', moduleKey: 'sueldos-vendedores' },
    ],
  },
  {
    title: 'Gestion',
    items: [
      { to: '/app/caja',             label: 'Caja rapida',          shortLabel: 'Caja',       icon: Keyboard,     roles: ['admin', 'gerente', 'gerente_sucursal', 'vendedor'] },
      { to: '/app/ventas',           label: 'Ventas',               shortLabel: 'Ventas',     icon: ReceiptText,  roles: ['admin', 'gerente', 'gerente_sucursal', 'vendedor', 'fletero'] },
      { to: '/app/rankings',         label: 'Rankings',             shortLabel: 'Rankings',   icon: Trophy,       roles: ['admin', 'gerente', 'vendedor'],         moduleKey: 'rankings' },
      { to: '/app/stock',            label: 'Stock',                shortLabel: 'Stock',      icon: Boxes,        roles: ['admin', 'gerente', 'gerente_sucursal', 'vendedor'] },
      { to: '/app/compras',          label: 'Compra de productos',  shortLabel: 'Compras',    icon: ShoppingCart, roles: ['admin', 'gerente'],                     moduleKey: 'compras' },
      { to: '/app/proveedores',      label: 'Proveedores',          shortLabel: 'Proveed.',   icon: Truck,        roles: ['admin', 'gerente'],                     moduleKey: 'proveedores' },
      { to: '/app/comprobantes',     label: 'Comprobantes',         shortLabel: 'Comprob.',   icon: ReceiptText,  roles: ['admin', 'gerente', 'vendedor'],        moduleKey: 'proveedores' },
      { to: '/app/medicina-laboral', label: 'Medicina Laboral',     shortLabel: 'Laboral',    icon: HeartPulse,   roles: ['admin', 'gerente', 'vendedor'],         moduleKey: 'medicina-laboral' },
      { to: '/app/ordenes-servicio', label: 'Servicio Tecnico',     shortLabel: 'S. Tecnico', icon: Wrench,       roles: ['admin', 'gerente', 'vendedor'],         moduleKey: 'ordenes-servicio' },
      { to: '/app/fabricacion',      label: 'Fabricacion',          shortLabel: 'Fabric.',    icon: FlaskConical, roles: ['admin', 'gerente'], feature: 'fabricacion', moduleKey: 'fabricacion' },
    ],
  },
  {
    title: 'Herramientas',
    items: [
      { to: '/app/categorias',   label: 'Categorias',    shortLabel: 'Categorias', icon: Tags,      roles: ['admin', 'gerente'] },
      { to: '/app/catalogo',     label: 'Catalogo',      shortLabel: 'Catalogo',   icon: Store,     roles: ['admin', 'gerente'],                      moduleKey: 'catalogo' },
      { to: '/app/multideposito', label: 'Multideposito', shortLabel: 'Depositos', icon: Building2, roles: ['admin', 'gerente'], feature: 'multideposito', moduleKey: 'multideposito' },
      { to: '/app/agente', label: 'Agente del negocio', shortLabel: 'Agente', icon: Brain, roles: ['admin', 'gerente'], feature: 'ai' },
    ],
  },
  {
    title: 'Avanzado',
    items: [
      { to: '/app/crm',              label: 'CRM',                   shortLabel: 'CRM',      icon: Handshake,   roles: ['admin', 'gerente', 'vendedor'], feature: 'crm',          moduleKey: 'crm' },
      { to: '/app/marketplace',      label: 'Marketplace',           shortLabel: 'Market',   icon: BarChart3,   roles: ['admin', 'gerente'],             feature: 'marketplace',  moduleKey: 'marketplace' },
      { to: '/app/ofertas',          label: 'Ofertas y listas',      shortLabel: 'Ofertas',  icon: Tags,        roles: ['admin', 'gerente'],                                      moduleKey: 'ofertas' },
      { to: '/app/arca',             label: 'ARCA',                  shortLabel: 'ARCA',     icon: Wallet,      roles: ['admin', 'gerente'],             feature: 'arca',         moduleKey: 'arca' },
      { to: '/app/postventa',        label: 'Postventa',             shortLabel: 'Postventa', icon: ClipboardCheck, roles: ['admin', 'gerente', 'vendedor'], feature: 'postventa', moduleKey: 'postventa' },
      { to: '/app/finanzas',         label: 'Finanzas',              shortLabel: 'Finanzas', icon: Wallet,      roles: ['admin', 'gerente'] },
      { to: '/app/informes',         label: 'Informes',              shortLabel: 'Informes', icon: FileBarChart2, roles: ['admin', 'gerente'] },
      { to: '/app/aprobaciones',     label: 'Aprobaciones',          shortLabel: 'Aprob.',   icon: ShieldCheck, roles: ['admin', 'gerente'],             feature: 'aprobaciones', moduleKey: 'aprobaciones' },
      { to: '/app/usuarios',         label: 'Usuarios',              shortLabel: 'Usuarios', icon: UserRoundCog, roles: ['admin', 'gerente_sucursal'],  feature: 'usuarios' },
      { to: '/app/sueldos-vendedores', label: 'Sueldo a vendedores', shortLabel: 'Sueldos',  icon: Wallet,      roles: ['admin'],                        feature: 'usuarios',     moduleKey: 'sueldos-vendedores' },
      { to: '/app/configuracion',    label: 'Configuracion',         shortLabel: 'Config',   icon: Settings2,   roles: ['admin'] },
      { to: '/app/alertas',          label: 'Alertas WhatsApp',      shortLabel: 'Alertas',  icon: Bell,        roles: ['admin'],                                                 moduleKey: 'alertas' },
      { to: '/app/integraciones',    label: 'Integraciones',         shortLabel: 'Integrac.', icon: Link2,      roles: ['admin', 'gerente'],             feature: 'integraciones', moduleKey: 'integraciones' },
    ],
  },
];

function canSee(
  item: NavItem,
  role: string | null,
  status: any,
  enabledModules: Record<string, boolean>,
): boolean {
  if (!role) return false;
  if (Array.isArray(item.roles) && item.roles.length > 0 && !item.roles.includes(role)) return false;
  if (!hasFeature(status, item.feature)) return false;
  // Si el módulo tiene clave de toggle y está explícitamente en false → ocultar
  if (item.moduleKey && enabledModules[item.moduleKey] === false) return false;
  return true;
}

const SIMPLE_ROUTES = new Set([
  '/app/dashboard',
  '/app/mi-sucursal',
  '/app/caja',
  '/app/ventas',
  '/app/comprobantes',
  '/app/clientes',
  '/app/productos',
  '/app/stock',
  '/app/agente',
  '/app/rankings',
  '/app/mi-cuenta/comisiones',
]);

export function getNavGroups(
  role: string | null,
  status: any,
  viewMode: 'simple' | 'advanced' = 'advanced',
  enabledModules: Record<string, boolean> = {},
): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (!canSee(item, role, status, enabledModules)) return false;
      if (viewMode === 'simple' && !SIMPLE_ROUTES.has(item.to)) return false;
      return true;
    }),
  })).filter((group) => group.items.length > 0);
}

export function getBottomNavItems(
  role: string | null,
  status: any,
  viewMode: 'simple' | 'advanced' = 'advanced',
  enabledModules: Record<string, boolean> = {},
): NavItem[] {
  const groups = getNavGroups(role, status, viewMode, enabledModules);
  const all = groups.flatMap((group) => group.items);

  if (role === 'fletero') {
    const fleteroOnly = all.filter((item) => item.to === '/app/ventas');
    return fleteroOnly.length ? fleteroOnly : all.slice(0, 1);
  }

  if (role === 'gerente_sucursal') {
    const priority = ['/app/mi-sucursal', '/app/ventas', '/app/clientes', '/app/stock', '/app/caja'];
    const selected: NavItem[] = [];
    for (const route of priority) {
      const item = all.find((candidate) => candidate.to === route);
      if (item && !selected.some((added) => added.to === item.to)) {
        selected.push(item);
      }
      if (selected.length >= 4) break;
    }
    return selected.length ? selected : all.slice(0, 4);
  }

  const priority =
    viewMode === 'simple'
      ? ['/app/caja', '/app/ventas', '/app/mi-cuenta/comisiones', '/app/clientes', '/app/productos']
      : ['/app/dashboard', '/app/ventas', '/app/mi-cuenta/comisiones', '/app/clientes', '/app/stock', '/app/productos'];

  const selected: NavItem[] = [];
  for (const route of priority) {
    const item = all.find((candidate) => candidate.to === route);
    if (item && !selected.some((added) => added.to === item.to)) {
      selected.push(item);
    }
    if (selected.length >= 4) break;
  }
  if (selected.length < 4) {
    for (const item of all) {
      if (selected.some((added) => added.to === item.to)) continue;
      selected.push(item);
      if (selected.length >= 4) break;
    }
  }
  return selected;
}
