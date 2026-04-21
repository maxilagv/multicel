import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import AdminLayout from '../layout/Layout';
import { useAuth } from '../context/AuthContext';
import { useLicense } from '../context/LicenseContext';
import { useTenantModules } from '../context/TenantModulesContext';
import { FEATURE_LABELS, hasFeature, type FeatureKey } from '../lib/features';
import ModuloNoHabilitado from '../pages/ModuloNoHabilitado';
import { getRoleFromToken } from '../lib/auth';
import PageErrorBoundary from '../components/PageErrorBoundary';

const LoginPage = lazy(() => import('../pages/Login'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const MiSucursal = lazy(() => import('../pages/MiSucursal'));
const AgenteNegocio = lazy(() => import('../pages/AgenteNegocio'));
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
const CRM = lazy(() => import('../pages/CRMProfundo'));
const CarpetasLaborales = lazy(() => import('../pages/CarpetasLaborales'));
const Postventa = lazy(() => import('../pages/Postventa'));
const Aprobaciones = lazy(() => import('../pages/Aprobaciones'));
const Ventas = lazy(() => import('../pages/Ventas'));
const CajaRapida = lazy(() => import('../pages/CajaRapida'));
const Compras = lazy(() => import('../pages/Compras'));
const Proveedores = lazy(() => import('../pages/Proveedores'));
const ComprobantesCuentaEmpresa = lazy(() => import('../pages/ComprobantesCuentaEmpresa'));
const Multideposito = lazy(() => import('../pages/Multideposito'));
const Marketplace = lazy(() => import('../pages/Marketplace'));
const Arca = lazy(() => import('../pages/Arca'));
const SueldosVendedores = lazy(() => import('../pages/SueldosVendedores'));
const VendedorComisiones = lazy(() => import('../pages/VendedorComisiones'));
const MiCuentaComisiones = lazy(() => import('../pages/MiCuentaComisiones'));
const RemitoRedirect = lazy(() => import('../pages/RemitoRedirect'));
const OfertasPrecios = lazy(() => import('../pages/OfertasPrecios'));
const ConfiguracionAlertas = lazy(() => import('../pages/ConfiguracionAlertas'));
const Integraciones = lazy(() => import('../pages/Integraciones'));
const Rankings = lazy(() => import('../pages/Rankings'));
const OrdenesServicio = lazy(() => import('../pages/OrdenesServicio'));
const Fabricacion     = lazy(() => import('../pages/Fabricacion'));

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

function ModuleGate({ moduleKey, children }: { moduleKey: string; children: ReactNode }) {
  const { isModuleEnabled, loading } = useTenantModules();
  if (loading) {
    return <div className="text-sm text-slate-400">Cargando módulo...</div>;
  }
  if (!isModuleEnabled(moduleKey)) {
    return <ModuloNoHabilitado adminDisabled />;
  }
  return children;
}

function RoleGate({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { accessToken } = useAuth();
  const role = getRoleFromToken(accessToken);
  if (!role) return <Navigate to="/login" replace />;
  if (!roles.includes(role)) {
    if (role === 'fletero') return <Navigate to="/app/ventas" replace />;
    if (role === 'gerente_sucursal') return <Navigate to="/app/mi-sucursal" replace />;
    return <Navigate to="/app/dashboard" replace />;
  }
  return children;
}

function AppIndexRedirect() {
  const { accessToken } = useAuth();
  const role = getRoleFromToken(accessToken);
  if (role === 'fletero') return <Navigate to="/app/ventas" replace />;
  if (role === 'gerente_sucursal') return <Navigate to="/app/mi-sucursal" replace />;
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
          <Route path="mi-sucursal" element={<RoleGate roles={['admin', 'gerente', 'gerente_sucursal']}><Page><FeatureGate feature="multideposito"><ModuleGate moduleKey="multideposito"><Suspense fallback={<RouteFallback />}><MiSucursal /></Suspense></ModuleGate></FeatureGate></Page></RoleGate>} />
          <Route path="caja" element={<RoleGate roles={['admin', 'gerente', 'gerente_sucursal', 'vendedor']}><Page><Suspense fallback={<RouteFallback />}><CajaRapida /></Suspense></Page></RoleGate>} />
          <Route path="clientes" element={<RoleGate roles={['admin', 'gerente', 'gerente_sucursal', 'vendedor']}><Page><Suspense fallback={<RouteFallback />}><Clientes /></Suspense></Page></RoleGate>} />
          <Route path="productos" element={<RoleGate roles={['admin', 'gerente', 'vendedor']}><Page><Suspense fallback={<RouteFallback />}><Productos /></Suspense></Page></RoleGate>} />
          <Route path="ventas" element={<RoleGate roles={['admin', 'gerente', 'gerente_sucursal', 'vendedor', 'fletero']}><Page><Suspense fallback={<RouteFallback />}><Ventas /></Suspense></Page></RoleGate>} />
          <Route path="rankings"          element={<RoleGate roles={['admin', 'gerente', 'vendedor']}><Page><ModuleGate moduleKey="rankings"><Suspense fallback={<RouteFallback />}><Rankings /></Suspense></ModuleGate></Page></RoleGate>} />
          <Route path="compras"           element={<RoleGate roles={['admin', 'gerente']}><Page><ModuleGate moduleKey="compras"><Suspense fallback={<RouteFallback />}><Compras /></Suspense></ModuleGate></Page></RoleGate>} />
          <Route path="proveedores"       element={<RoleGate roles={['admin', 'gerente']}><Page><ModuleGate moduleKey="proveedores"><Suspense fallback={<RouteFallback />}><Proveedores /></Suspense></ModuleGate></Page></RoleGate>} />
          <Route path="comprobantes"      element={<RoleGate roles={['admin', 'gerente', 'vendedor']}><Page><ModuleGate moduleKey="proveedores"><Suspense fallback={<RouteFallback />}><ComprobantesCuentaEmpresa /></Suspense></ModuleGate></Page></RoleGate>} />
          <Route path="multideposito"     element={<RoleGate roles={['admin', 'gerente']}><Page><FeatureGate feature="multideposito"><ModuleGate moduleKey="multideposito"><Suspense fallback={<RouteFallback />}><Multideposito /></Suspense></ModuleGate></FeatureGate></Page></RoleGate>} />
          <Route path="categorias"        element={<RoleGate roles={['admin', 'gerente']}><Page><Suspense fallback={<RouteFallback />}><Categorias /></Suspense></Page></RoleGate>} />
          <Route path="catalogo"          element={<RoleGate roles={['admin', 'gerente']}><Page><ModuleGate moduleKey="catalogo"><Suspense fallback={<RouteFallback />}><CatalogoAdmin /></Suspense></ModuleGate></Page></RoleGate>} />
          <Route path="stock"             element={<RoleGate roles={['admin', 'gerente', 'gerente_sucursal', 'vendedor']}><Page><Suspense fallback={<RouteFallback />}><Stock /></Suspense></Page></RoleGate>} />
          <Route path="agente"            element={<RoleGate roles={['admin', 'gerente']}><Page><FeatureGate feature="ai"><Suspense fallback={<RouteFallback />}><AgenteNegocio /></Suspense></FeatureGate></Page></RoleGate>} />
          <Route path="finanzas"          element={<RoleGate roles={['admin', 'gerente']}><Page><Suspense fallback={<RouteFallback />}><Finanzas /></Suspense></Page></RoleGate>} />
          <Route path="informes"          element={<RoleGate roles={['admin', 'gerente']}><Page><Suspense fallback={<RouteFallback />}><Informes /></Suspense></Page></RoleGate>} />
          <Route path="usuarios"          element={<RoleGate roles={['admin', 'gerente_sucursal']}><Page><FeatureGate feature="usuarios"><Suspense fallback={<RouteFallback />}><Usuarios /></Suspense></FeatureGate></Page></RoleGate>} />
          <Route path="sueldos-vendedores" element={<RoleGate roles={['admin']}><Page><FeatureGate feature="usuarios"><ModuleGate moduleKey="sueldos-vendedores"><Suspense fallback={<RouteFallback />}><SueldosVendedores /></Suspense></ModuleGate></FeatureGate></Page></RoleGate>} />
          <Route path="vendedores/:id/comisiones" element={<RoleGate roles={['admin', 'gerente']}><Page><FeatureGate feature="usuarios"><ModuleGate moduleKey="sueldos-vendedores"><Suspense fallback={<RouteFallback />}><VendedorComisiones /></Suspense></ModuleGate></FeatureGate></Page></RoleGate>} />
          <Route path="mi-cuenta/comisiones" element={<RoleGate roles={['vendedor']}><Page><FeatureGate feature="usuarios"><ModuleGate moduleKey="sueldos-vendedores"><Suspense fallback={<RouteFallback />}><MiCuentaComisiones /></Suspense></ModuleGate></FeatureGate></Page></RoleGate>} />
          <Route path="configuracion"     element={<RoleGate roles={['admin']}><Page><Suspense fallback={<RouteFallback />}><ConfiguracionAdmin /></Suspense></Page></RoleGate>} />
          <Route path="alertas"           element={<RoleGate roles={['admin']}><Page><ModuleGate moduleKey="alertas"><Suspense fallback={<RouteFallback />}><ConfiguracionAlertas /></Suspense></ModuleGate></Page></RoleGate>} />
          <Route path="integraciones"     element={<RoleGate roles={['admin', 'gerente']}><Page><FeatureGate feature="integraciones"><ModuleGate moduleKey="integraciones"><Suspense fallback={<RouteFallback />}><Integraciones /></Suspense></ModuleGate></FeatureGate></Page></RoleGate>} />
          <Route path="prioridades"       element={<Navigate to="/app/agente?view=priorities" replace />} />
          <Route path="asistente-negocio" element={<Navigate to="/app/agente?view=ask&preset=overview" replace />} />
          <Route path="predicciones"      element={<Navigate to="/app/agente?view=analyze" replace />} />
          <Route path="crm"               element={<RoleGate roles={['admin', 'gerente', 'vendedor']}><Page><FeatureGate feature="crm"><ModuleGate moduleKey="crm"><Suspense fallback={<RouteFallback />}><CRM /></Suspense></ModuleGate></FeatureGate></Page></RoleGate>} />
          <Route path="medicina-laboral"  element={<RoleGate roles={['admin', 'gerente', 'vendedor']}><Page><ModuleGate moduleKey="medicina-laboral"><Suspense fallback={<RouteFallback />}><CarpetasLaborales /></Suspense></ModuleGate></Page></RoleGate>} />
          <Route path="postventa"         element={<RoleGate roles={['admin', 'gerente', 'vendedor']}><Page><FeatureGate feature="postventa"><ModuleGate moduleKey="postventa"><Suspense fallback={<RouteFallback />}><Postventa /></Suspense></ModuleGate></FeatureGate></Page></RoleGate>} />
          <Route path="aprobaciones"      element={<RoleGate roles={['admin', 'gerente']}><Page><FeatureGate feature="aprobaciones"><ModuleGate moduleKey="aprobaciones"><Suspense fallback={<RouteFallback />}><Aprobaciones /></Suspense></ModuleGate></FeatureGate></Page></RoleGate>} />
          <Route path="marketplace"       element={<RoleGate roles={['admin', 'gerente']}><Page><FeatureGate feature="marketplace"><ModuleGate moduleKey="marketplace"><Suspense fallback={<RouteFallback />}><Marketplace /></Suspense></ModuleGate></FeatureGate></Page></RoleGate>} />
          <Route path="ofertas"           element={<RoleGate roles={['admin', 'gerente']}><Page><ModuleGate moduleKey="ofertas"><Suspense fallback={<RouteFallback />}><OfertasPrecios /></Suspense></ModuleGate></Page></RoleGate>} />
          <Route path="arca"              element={<RoleGate roles={['admin', 'gerente']}><Page><FeatureGate feature="arca"><ModuleGate moduleKey="arca"><Suspense fallback={<RouteFallback />}><Arca /></Suspense></ModuleGate></FeatureGate></Page></RoleGate>} />
          <Route path="remitos/:id"       element={<RoleGate roles={['admin', 'gerente', 'vendedor', 'fletero']}><Page><Suspense fallback={<RouteFallback />}><RemitoRedirect /></Suspense></Page></RoleGate>} />
          <Route path="ordenes-servicio"  element={<RoleGate roles={['admin', 'gerente', 'vendedor']}><Page><ModuleGate moduleKey="ordenes-servicio"><Suspense fallback={<RouteFallback />}><OrdenesServicio /></Suspense></ModuleGate></Page></RoleGate>} />
          <Route path="fabricacion"       element={<RoleGate roles={['admin', 'gerente']}><Page><FeatureGate feature="fabricacion"><ModuleGate moduleKey="fabricacion"><Suspense fallback={<RouteFallback />}><Fabricacion /></Suspense></ModuleGate></FeatureGate></Page></RoleGate>} />
        </Route>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function Page({ children }: { children: ReactNode }) {
  const location = useLocation();
  const pageName =
    location.pathname
      .split('/')
      .filter(Boolean)
      .slice(-1)[0]
      ?.replace(/-/g, ' ') || 'modulo';

  return (
    <PageErrorBoundary pageName={pageName}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
        {children}
      </motion.div>
    </PageErrorBoundary>
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
