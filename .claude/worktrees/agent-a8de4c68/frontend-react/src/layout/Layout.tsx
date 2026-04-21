import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import MobileBottomNav from './MobileBottomNav';
import AppAmbient from '../ui/AppAmbient';
import { useMediaQuery } from '../lib/useMediaQuery';

export default function AdminLayout() {
  const isDesktop = useMediaQuery('(min-width: 1024px)', true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isDesktop) setMobileMenuOpen(false);
  }, [isDesktop]);

  return (
    <div
      className="app-root app-surface min-h-screen w-full grid relative overflow-hidden font-ui"
      style={
        isDesktop
          ? { gridTemplateColumns: collapsed ? '88px 1fr' : '272px 1fr', gridTemplateRows: '72px 1fr' }
          : { gridTemplateColumns: '1fr', gridTemplateRows: '72px 1fr' }
      }
    >
      <AppAmbient />

      {isDesktop && (
        <div className="row-span-2 relative z-20">
          <Sidebar collapsed={collapsed} />
        </div>
      )}

      <div className="relative z-20">
        <Navbar
          isMobile={!isDesktop}
          onToggleSidebar={() => setCollapsed((current) => !current)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />
      </div>

      <main className={`relative z-10 text-slate-100 px-3 sm:px-4 ${isDesktop ? 'py-6' : 'py-4 pb-24'}`}>
        <div className="max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>

      <AnimatePresence>
        {!isDesktop && mobileMenuOpen && (
          <>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/70"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Cerrar menu"
            />
            <motion.div
              initial={{ x: -340 }}
              animate={{ x: 0 }}
              exit={{ x: -340 }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="fixed left-0 top-0 bottom-0 z-50"
            >
              <Sidebar mobile />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {!isDesktop && <MobileBottomNav />}
    </div>
  );
}
