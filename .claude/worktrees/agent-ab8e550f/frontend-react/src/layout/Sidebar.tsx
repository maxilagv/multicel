import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLicense } from '../context/LicenseContext';
import { getRoleFromToken } from '../lib/auth';
import { BRAND } from '../config/branding';
import { getNavGroups } from './navigationConfig';

export default function Sidebar({ collapsed, mobile = false }: { collapsed?: boolean; mobile?: boolean }) {
  const { accessToken } = useAuth();
  const { status } = useLicense();
  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);
  const groups = useMemo(() => getNavGroups(role, status), [role, status]);
  const initials = useMemo(
    () =>
      BRAND.name
        .split(' ')
        .filter(Boolean)
        .map((word) => word[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    []
  );

  return (
    <motion.aside
      animate={{ width: mobile ? 296 : collapsed ? 88 : 272 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      className="h-full bg-black/50 backdrop-blur-xl text-slate-200 border-r border-white/10 flex flex-col"
      style={{ overflow: 'hidden' }}
    >
      <div className="h-[72px] flex items-center gap-3 px-5 border-b border-white/10 relative">
        <div className="absolute inset-0 opacity-60 bg-gradient-to-br from-indigo-500/10 via-transparent to-cyan-500/10" />
        {BRAND.logoUrl ? (
          <img
            src={BRAND.logoUrl}
            alt={BRAND.name}
            className="relative h-10 w-10 rounded-2xl object-cover shadow-[0_12px_30px_rgba(15,23,42,0.35)]"
          />
        ) : (
          <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white flex items-center justify-center font-semibold shadow-[0_12px_30px_rgba(45,212,191,0.25)]">
            <span className="font-logo text-lg">{initials || 'GW'}</span>
          </div>
        )}
        {(!collapsed || mobile) && (
          <div className="relative">
            <div className="text-sm font-semibold">{BRAND.name}</div>
            <div className="text-[11px] text-slate-400 font-data">Operacion</div>
          </div>
        )}
      </div>

      <nav className="px-3 py-4 space-y-4 flex-1 app-scrollbar overflow-y-auto">
        {groups.map((group) => (
          <div key={group.title} className="space-y-2">
            {(!collapsed || mobile) && (
              <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500 px-2">{group.title}</div>
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
                        ? 'active bg-indigo-500/15 text-white shadow-[0_10px_30px_rgba(99,102,241,0.15)]'
                        : 'text-slate-300 hover:text-white hover:bg-white/5',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-indigo-400 transition-opacity',
                        'opacity-0 group-hover:opacity-60',
                        'group-[.active]:opacity-100',
                      ].join(' ')}
                    />
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-slate-100 transition-transform group-hover:scale-105">
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

      <div className="p-3 border-t border-white/10 text-slate-400 text-xs">
        {(!collapsed || mobile) && <div>Acceso operativo seguro</div>}
      </div>
    </motion.aside>
  );
}
