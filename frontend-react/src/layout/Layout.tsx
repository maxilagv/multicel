import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import MobileBottomNav from './MobileBottomNav';
import AppAmbient from '../ui/AppAmbient';
import WelcomeWizard from '../components/WelcomeWizard';
import KeyboardShortcutsDialog from '../components/KeyboardShortcutsDialog';
import OfflineIndicator from '../components/OfflineIndicator';
import ChatWidget from '../components/ChatWidget';
import { useViewMode } from '../context/ViewModeContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { usePWAUpdate } from '../hooks/usePWAUpdate';

export default function AdminLayout() {
  const isDesktop = useMediaQuery('(min-width: 1024px)', true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { viewMode } = useViewMode();
  usePWAUpdate();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isDesktop) setMobileMenuOpen(false);
  }, [isDesktop]);

  useKeyboardShortcuts([
    {
      key: 'F1',
      label: 'Caja rapida',
      action: (event) => {
        event.preventDefault();
        navigate('/app/caja');
      },
    },
    {
      key: 'F2',
      label: 'Nueva venta',
      action: (event) => {
        event.preventDefault();
        navigate('/app/ventas?open=1');
      },
    },
    {
      key: 'F3',
      label: 'Buscar producto',
      action: (event) => {
        event.preventDefault();
        if (location.pathname === '/app/caja') {
          window.dispatchEvent(new CustomEvent('kaisen:focus-product-search'));
          return;
        }
        navigate('/app/caja?focus=search');
      },
    },
    {
      key: 'F5',
      label: 'Actualizar',
      action: (event) => {
        event.preventDefault();
        window.location.reload();
      },
    },
    {
      key: 'p',
      label: 'Imprimir',
      ctrlKey: true,
      action: (event) => {
        event.preventDefault();
        window.print();
      },
    },
    {
      key: 'p',
      label: 'Imprimir',
      metaKey: true,
      action: (event) => {
        event.preventDefault();
        window.print();
      },
    },
    {
      key: '/',
      label: 'Ver atajos',
      ctrlKey: true,
      action: (event) => {
        event.preventDefault();
        setShortcutsOpen(true);
      },
    },
    {
      key: '?',
      label: 'Ver atajos',
      shiftKey: true,
      action: (event) => {
        event.preventDefault();
        setShortcutsOpen(true);
      },
    },
    {
      key: 'Escape',
      label: 'Cerrar',
      allowInInputs: true,
      action: () => {
        setShortcutsOpen(false);
        setMobileMenuOpen(false);
        window.dispatchEvent(new CustomEvent('kaisen:escape'));
      },
    },
  ]);

  return (
    <>
    <OfflineIndicator />
    <div
      className="app-root app-surface min-h-screen w-full grid relative overflow-hidden font-ui"
      data-view-mode={viewMode}
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
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />
      </div>

      <main className={`relative z-10 text-slate-900 dark:text-slate-100 px-3 sm:px-4 ${isDesktop ? 'py-6' : 'py-4 pb-24'}`}>
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

      <WelcomeWizard />
      <KeyboardShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ChatWidget />
    </div>
    </>
  );
}
