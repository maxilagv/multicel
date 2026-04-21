import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLicense } from '../context/LicenseContext';
import { useViewMode } from '../context/ViewModeContext';
import { useCompany } from '../context/CompanyContext';
import { useTenantModules } from '../context/TenantModulesContext';
import { getRoleFromToken } from '../lib/auth';
import OwnerAlertsPanel from '../components/OwnerAlertsPanel';
import { getNavGroups } from './navigationConfig';

export default function Sidebar({ collapsed, mobile = false }: { collapsed?: boolean; mobile?: boolean }) {
  const { accessToken } = useAuth();
  const { status } = useLicense();
  const { viewMode, toggleViewMode } = useViewMode();
  const { company } = useCompany();
  const { modules } = useTenantModules();
  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);
  const groups = useMemo(() => getNavGroups(role, status, viewMode, modules), [role, status, viewMode, modules]);
  const initials = useMemo(
    () =>
      company.name
        .split(' ')
        .filter(Boolean)
        .map((word) => word[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    [company.name]
  );

  return (
    <motion.aside
      animate={{ width: mobile ? 296 : collapsed ? 88 : 272 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      className="h-full bg-white/95 dark:bg-black/50 backdrop-blur-xl text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-white/10 flex flex-col"
      style={{ overflow: 'hidden' }}
    >
      <div className="h-[72px] flex items-center gap-3 px-5 border-b border-slate-200 dark:border-white/10 relative">
        <div className="absolute inset-0 opacity-60 bg-gradient-to-br from-indigo-500/10 via-transparent to-cyan-500/10" />
        {company.logoUrl ? (
          <img
            src={company.logoUrl}
            alt={company.name}
            className="relative h-10 w-10 rounded-2xl object-cover shadow-[0_12px_30px_rgba(15,23,42,0.35)]"
          />
        ) : (
          <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white flex items-center justify-center font-semibold shadow-[0_12px_30px_rgba(45,212,191,0.25)]">
            <span className="font-logo text-lg">{initials || 'ERP'}</span>
          </div>
        )}
        {(!collapsed || mobile) && (
          <div className="relative">
            <div className="text-sm font-semibold">{company.name}</div>
            <div className="text-[11px] text-slate-400 font-data">Operacion</div>
          </div>
        )}
      </div>

      <nav className="px-3 py-4 space-y-4 flex-1 app-scrollbar overflow-y-auto">
        {groups.map((group) => (
          <div key={group.title} className="space-y-2">
            {(!collapsed || mobile) && (
              <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500 px-2">{group.title}</div>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => [
                      'relative group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40',
                      isActive
                        ? 'active bg-indigo-500/15 text-indigo-700 dark:text-white shadow-[0_10px_30px_rgba(99,102,241,0.15)]'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-indigo-400 transition-opacity',
                        'opacity-0 group-hover:opacity-60',
                        'group-[.active]:opacity-100',
                      ].join(' ')}
                    />
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-100 transition-transform group-hover:scale-105">
                      <Icon size={17} strokeWidth={2.2} />
                    </span>
                    {(!collapsed || mobile) && <span>{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {(role === 'admin' || role === 'gerente') && (!collapsed || mobile) && (
        <OwnerAlertsPanel />
      )}

      <div className="p-3 border-t border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 text-xs">
        {(!collapsed || mobile) && (
          <div className="space-y-2">
            <div>{viewMode === 'simple' ? 'Vista simple activa' : 'Acceso operativo seguro'}</div>
            <button
              type="button"
              onClick={toggleViewMode}
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 transition hover:bg-slate-200 dark:hover:bg-white/10"
            >
              Cambiar a {viewMode === 'simple' ? 'vista completa' : 'vista simple'}
            </button>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
