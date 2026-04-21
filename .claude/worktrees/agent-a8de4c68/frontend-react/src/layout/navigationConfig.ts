import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Boxes,
  Brain,
  Building2,
  ClipboardCheck,
  FileBarChart2,
  Handshake,
  LayoutDashboard,
  Package,
  ReceiptText,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  UserRoundCog,
  UsersRound,
  Wallet,
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
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Principal',
    items: [
      { to: '/app/dashboard', label: 'Dashboard', shortLabel: 'Inicio', icon: LayoutDashboard, roles: ['admin', 'gerente', 'vendedor'] },
      { to: '/app/clientes', label: 'Clientes', shortLabel: 'Clientes', icon: UsersRound, roles: ['admin', 'gerente', 'vendedor'] },
      { to: '/app/productos', label: 'Productos', shortLabel: 'Productos', icon: Package, roles: ['admin', 'gerente', 'vendedor'] },
    ],
  },
  {
    title: 'Gestion',
    items: [
      { to: '/app/ventas', label: 'Ventas', shortLabel: 'Ventas', icon: ReceiptText, roles: ['admin', 'gerente', 'vendedor', 'fletero'] },
      { to: '/app/stock', label: 'Stock', shortLabel: 'Stock', icon: Boxes, roles: ['admin', 'gerente', 'vendedor'] },
      { to: '/app/compras', label: 'Compra de productos', shortLabel: 'Compras', icon: ShoppingCart, roles: ['admin', 'gerente'] },
      { to: '/app/proveedores', label: 'Proveedores', shortLabel: 'Proveedores', icon: Truck, roles: ['admin', 'gerente'] },
    ],
  },
  {
    title: 'Herramientas',
    items: [
      { to: '/app/categorias', label: 'Categorias', shortLabel: 'Categorias', icon: Tags, roles: ['admin', 'gerente'] },
      { to: '/app/catalogo', label: 'Catalogo', shortLabel: 'Catalogo', icon: Store, roles: ['admin', 'gerente'] },
      { to: '/app/multideposito', label: 'Multideposito', shortLabel: 'Depositos', icon: Building2, roles: ['admin', 'gerente'], feature: 'multideposito' },
      { to: '/app/predicciones', label: 'Predicciones', shortLabel: 'IA', icon: Brain, roles: ['admin', 'gerente'], feature: 'ai' },
    ],
  },
  {
    title: 'Avanzado',
    items: [
      { to: '/app/crm', label: 'CRM', shortLabel: 'CRM', icon: Handshake, roles: ['admin', 'gerente', 'vendedor'], feature: 'crm' },
      { to: '/app/marketplace', label: 'Marketplace', shortLabel: 'Market', icon: BarChart3, roles: ['admin', 'gerente'], feature: 'marketplace' },
      { to: '/app/ofertas', label: 'Ofertas y listas', shortLabel: 'Ofertas', icon: Tags, roles: ['admin', 'gerente'] },
      { to: '/app/arca', label: 'ARCA', shortLabel: 'ARCA', icon: Wallet, roles: ['admin', 'gerente'], feature: 'arca' },
      { to: '/app/postventa', label: 'Postventa', shortLabel: 'Postventa', icon: ClipboardCheck, roles: ['admin', 'gerente', 'vendedor'], feature: 'postventa' },
      { to: '/app/finanzas', label: 'Finanzas', shortLabel: 'Finanzas', icon: Wallet, roles: ['admin', 'gerente'] },
      { to: '/app/informes', label: 'Informes', shortLabel: 'Informes', icon: FileBarChart2, roles: ['admin', 'gerente'] },
      { to: '/app/aprobaciones', label: 'Aprobaciones', shortLabel: 'Aprob.', icon: ShieldCheck, roles: ['admin', 'gerente'], feature: 'aprobaciones' },
      { to: '/app/usuarios', label: 'Usuarios', shortLabel: 'Usuarios', icon: UserRoundCog, roles: ['admin'], feature: 'usuarios' },
      { to: '/app/sueldos-vendedores', label: 'Sueldo a vendedores', shortLabel: 'Sueldos', icon: Wallet, roles: ['admin'], feature: 'usuarios' },
      { to: '/app/configuracion', label: 'Configuracion', shortLabel: 'Config', icon: Settings2, roles: ['admin'] },
    ],
  },
];

function canSee(item: NavItem, role: string | null, status: any) {
  if (!role) return false;
  if (Array.isArray(item.roles) && item.roles.length > 0 && !item.roles.includes(role)) return false;
  return hasFeature(status, item.feature);
}

export function getNavGroups(role: string | null, status: any): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSee(item, role, status)),
  })).filter((group) => group.items.length > 0);
}

export function getBottomNavItems(role: string | null, status: any): NavItem[] {
  const groups = getNavGroups(role, status);
  const all = groups.flatMap((group) => group.items);

  if (role === 'fletero') {
    const fleteroOnly = all.filter((item) => item.to === '/app/ventas');
    return fleteroOnly.length ? fleteroOnly : all.slice(0, 1);
  }

  const priority = ['/app/dashboard', '/app/ventas', '/app/clientes', '/app/informes', '/app/stock', '/app/productos'];
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
