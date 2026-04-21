import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import AdminLayout from '../layout/Layout';
import { useAuth } from '../context/AuthContext';
import { useLicense } from '../context/LicenseContext';
import { FEATURE_LABELS, hasFeature, type FeatureKey } from '../lib/features';
import ModuloNoHabilitado from '../pages/ModuloNoHabilitado';
import { getRoleFromToken } from '../lib/auth';

const LoginPage = lazy(() => import('../pages/Login'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const Predicciones = lazy(() => import('../pages/Predicciones'));
const Clientes = lazy(() => import('../pages/Clientes'));
const Productos = lazy(() => import('../pages/Productos'));
const Categorias = lazy(() => import('../pages/Categorias'));
const CatalogoAdmin = lazy(() => import('../pages/CatalogoAdmin'));
const CatalogoPublico = lazy(() => import('../pages/CatalogoPublico'));
const Stock = lazy(() => import('../pages/Stock'));
const Finanzas = lazy(() => import('../pages/Finanzas'));
const Informes = lazy(() => import('../pages/Informes'));
const ConfiguracionAdmin = lazy(() => import('../pages/ConfiguracionAdmin'));
const Usuarios = lazy(() => import('../pages/Usuarios'));
const CRM = lazy(() => import('../pages/CRM'));
const Postventa = lazy(() => import('../pages/Postventa'));
const Aprobaciones = lazy(() => import('../pages/Aprobaciones'));
const Ventas = lazy(() => import('../pages/Ventas'));
const Compras = lazy(() => import('../pages/Compras'));
const Proveedores = lazy(() => import('../pages/Proveedores'));
const Multideposito = lazy(() => import('../pages/Multideposito'));
const Marketplace = lazy(() => import('../pages/Marketplace'));
const Arca = lazy(() => import('../pages/Arca'));
const SueldosVendedores = lazy(() => import('../pages/SueldosVendedores'));
const RemitoRedirect = lazy(() => import('../pages/RemitoRedirect'));
const OfertasPrecios = lazy(() => import('../pages/OfertasPrecios'));

function RouteFallback() {
  return (
    <div className="app-card p-4 text-sm text-slate-300">Cargando modulo...</div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { isAuthenticated, ready } = useAuth();
  if (!ready) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function FeatureGate({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const { status, loading } = useLicense();
  if (loading) {
    return <div className="text-sm text-slate-400">Cargando licencia...</div>;
  }
  if (!hasFeature(status, feature)) {
    return <ModuloNoHabilitado featureLabel={FEATURE_LABELS[feature]} />;
  }
  return children;
}

function RoleGate({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { accessToken } = useAuth();
  const role = getRoleFromToken(accessToken);
  if (!role) return <Navigate to="/login" replace />;
  if (!roles.includes(role)) {
    if (role === 'fletero') return <Navigate to="/app/ventas" replace />;
    return <Navigate to="/app/dashboard" replace />;
  }
  return children;
}

function AppIndexRedirect() {
  const { accessToken } = useAuth();
  const role = getRoleFromToken(accessToken);
  if (role === 'fletero') return <Navigate to="/app/ventas" replace />;
  return <Navigate to="/app/dashboard" replace />;
}

function AppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/catalogo" element={<Suspense fallback={<RouteFallback />}><CatalogoPublico /></Suspense>} />
        <Route path="/login" element={<Suspense fallback={<RouteFallback />}><LoginPage /></Suspense>} />
        <Route
          path="/app"
          element={
            <Protected>
              <AdminLayout />
            </Protected>
          }
        >
          <Route index element={<AppIndexRedirect />} />
          <Route path="dashboard" element={<RoleGate roles={['admin', 'gerente', 'vendedor']}><Page><Suspense fallback={<RouteFallback />}><Dashboard /></Suspense></Page></RoleGate>} />
          <Route path="clientes" element={<RoleGate roles={['admin', 'gerente', 'vendedor']}><Page><Suspense fallback={<RouteFallback />}><Clientes /></Suspense></Page></RoleGate>} />
          <Route path="productos" element={<RoleGate roles={['admin', 'gerente', 'vendedor']}><Page><Suspense fallback={<RouteFallback />}><Productos /></Suspense></Page></RoleGate>} />
          <Route path="ventas" element={<RoleGate roles={['admin', 'gerente', 'vendedor', 'fletero']}><Page><Suspense fallback={<RouteFallback />}><Ventas /></Suspense></Page></RoleGate>} />
          <Route path="compras" element={<RoleGate roles={['admin', 'gerente']}><Page><Suspense fallback={<RouteFallback />}><Compras /></Suspense></Page></RoleGate>} />
          <Route path="proveedores" element={<RoleGate roles={['admin', 'gerente']}><Page><Suspense fallback={<RouteFallback />}><Proveedores /></Suspense></Page></RoleGate>} />
          <Route path="multideposito" element={<RoleGate roles={['admin', 'gerente']}><Page><FeatureGate feature="multideposito"><Suspense fallback={<RouteFallback />}><Multideposito /></Suspense></FeatureGate></Page></RoleGate>} />
          <Route path="categorias" element={<RoleGate roles={['admin', 'gerente']}><Page><Suspense fallback={<RouteFallback />}><Categorias /></Suspense></Page></RoleGate>} />
          <Route path="catalogo" element={<RoleGate roles={['admin', 'gerente']}><Page><Suspense fallback={<RouteFallback />}><CatalogoAdmin /></Suspense></Page></RoleGate>} />
          <Route path="stock" element={<RoleGate roles={['admin', 'gerente', 'vendedor']}><Page><Suspense fallback={<RouteFallback />}><Stock /></Suspense></Page></RoleGate>} />
          <Route path="finanzas" element={<RoleGate roles={['admin', 'gerente']}><Page><Suspense fallback={<RouteFallback />}><Finanzas /></Suspense></Page></RoleGate>} />
          <Route path="informes" element={<RoleGate roles={['admin', 'gerente']}><Page><Suspense fallback={<RouteFallback />}><Informes /></Suspense></Page></RoleGate>} />
          <Route path="usuarios" element={<RoleGate roles={['admin']}><Page><FeatureGate feature="usuarios"><Suspense fallback={<RouteFallback />}><Usuarios /></Suspense></FeatureGate></Page></RoleGate>} />
          <Route path="sueldos-vendedores" element={<RoleGate roles={['admin']}><Page><FeatureGate feature="usuarios"><Suspense fallback={<RouteFallback />}><SueldosVendedores /></Suspense></FeatureGate></Page></RoleGate>} />
          <Route path="configuracion" element={<RoleGate roles={['admin']}><Page><Suspense fallback={<RouteFallback />}><ConfiguracionAdmin /></Suspense></Page></RoleGate>} />
          <Route path="predicciones" element={<RoleGate roles={['admin', 'gerente']}><Page><FeatureGate feature="ai"><Suspense fallback={<RouteFallback />}><Predicciones /></Suspense></FeatureGate></Page></RoleGate>} />
          <Route path="crm" element={<RoleGate roles={['admin', 'gerente', 'vendedor']}><Page><FeatureGate feature="crm"><Suspense fallback={<RouteFallback />}><CRM /></Suspense></FeatureGate></Page></RoleGate>} />
          <Route path="postventa" element={<RoleGate roles={['admin', 'gerente', 'vendedor']}><Page><FeatureGate feature="postventa"><Suspense fallback={<RouteFallback />}><Postventa /></Suspense></FeatureGate></Page></RoleGate>} />
          <Route path="aprobaciones" element={<RoleGate roles={['admin', 'gerente']}><Page><FeatureGate feature="aprobaciones"><Suspense fallback={<RouteFallback />}><Aprobaciones /></Suspense></FeatureGate></Page></RoleGate>} />
          <Route path="marketplace" element={<RoleGate roles={['admin', 'gerente']}><Page><FeatureGate feature="marketplace"><Suspense fallback={<RouteFallback />}><Marketplace /></Suspense></FeatureGate></Page></RoleGate>} />
          <Route path="ofertas" element={<RoleGate roles={['admin', 'gerente']}><Page><Suspense fallback={<RouteFallback />}><OfertasPrecios /></Suspense></Page></RoleGate>} />
          <Route path="arca" element={<RoleGate roles={['admin', 'gerente']}><Page><FeatureGate feature="arca"><Suspense fallback={<RouteFallback />}><Arca /></Suspense></FeatureGate></Page></RoleGate>} />
          <Route path="remitos/:id" element={<RoleGate roles={['admin', 'gerente', 'vendedor', 'fletero']}><Page><Suspense fallback={<RouteFallback />}><RemitoRedirect /></Suspense></Page></RoleGate>} />
        </Route>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
      {children}
    </motion.div>
  );
}

export default function AppRouter() {
  const useHashRouter =
    typeof window !== 'undefined' &&
    (window.location.protocol === 'file:' || (window as any)?.desktopEnv?.isDesktop);
  return useHashRouter ? (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  ) : (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
