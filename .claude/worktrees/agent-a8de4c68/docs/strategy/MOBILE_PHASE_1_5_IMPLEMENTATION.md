# Mobile Fases 1 a 5 - Implementacion

## Objetivo
Llevar el panel a una experiencia mobile-first consistente para los flujos operativos criticos sin romper desktop.

## Fase 1 - Diagnostico y baseline

### Instrumentacion agregada
- `frontend-react/src/lib/mobileTelemetry.ts`
  - Captura LCP, CLS y FID en runtime.
  - Clasifica cada metrica (`good`, `needs-improvement`, `poor`).
  - Persiste muestras en `window.__kaisenMobileVitals`.
- `frontend-react/src/main.tsx`
  - Inicializa telemetria al boot de la app.

### Alcance inicial priorizado
- `Ventas` (crear venta, registrar pago, remito, detalle).
- `Clientes` (listado, acciones principales, acceso a detalle).
- `Usuarios` (alta/edicion/listado operativo).
- `RemitoRedirect` (descarga rapida para fletero).

## Fase 2 - Arquitectura responsive unificada

### Estructura de navegacion centralizada
- `frontend-react/src/layout/navigationConfig.ts`
  - Define grupos/items en un solo contrato.
  - Controla visibilidad por rol + feature flags.
  - Expone seleccion para navegacion inferior movil.

### Hook reusable de viewport
- `frontend-react/src/lib/useMediaQuery.ts`
  - API comun para decisiones responsive por modulo.

## Fase 3 - Sistema de UI movil base

### Ajustes de componentes compartidos
- `frontend-react/src/ui/Button.tsx`
  - Target tactil minimo (`touch-target`).
- `frontend-react/src/ui/ChartCard.tsx`
  - Header adaptativo para mobile.
- `frontend-react/src/ui/DataTable.tsx`
  - Shell visual comun para tablas en overflow.

### Tokens y utilidades CSS
- `frontend-react/src/styles/index.css`
  - Variables de layout movil (`--mobile-header-height`, `--mobile-nav-height`).
  - Clases utilitarias: `touch-target`, `app-bottom-nav`, `mobile-modal-card`, `app-table-shell`.
  - Ajustes de densidad visual para <= 1023px.

## Fase 4 - Navegacion y estructura movil

### Layout responsive operativo
- `frontend-react/src/layout/Layout.tsx`
  - Desktop: sidebar fijo colapsable.
  - Mobile: drawer lateral con overlay.
  - Mobile: `bottom navigation` fija con safe-area.

### Navbar adaptada
- `frontend-react/src/layout/Navbar.tsx`
  - Boton de menu movil dedicado.
  - Jerarquia visual y densidad optimizada para pantallas chicas.

### Bottom nav movil
- `frontend-react/src/layout/MobileBottomNav.tsx`
  - Navegacion inferior por rol y capacidades.
  - Caso fletero con foco en `Ventas/Remitos`.

## Fase 5 - Flujos criticos mobile-first

### Ventas
- `frontend-react/src/pages/Ventas.tsx`
  - Listado abierto/historial con modo tarjetas en mobile.
  - Acciones tactiles grandes para pago/remito/entrega/cancelacion.
  - Modales de pago, detalle y remito adaptados a alto disponible movil.

### Clientes
- `frontend-react/src/pages/Clientes.tsx`
  - Listado principal con tarjetas mobile (deuda/estado/acciones).
  - Modal principal adaptado para scrolling interno seguro en mobile.

### Usuarios
- `frontend-react/src/pages/Usuarios.tsx`
  - Listado en tarjetas mobile con KPIs operativos + accion directa.

### Remito
- `frontend-react/src/pages/RemitoRedirect.tsx`
  - Pantalla compacta mobile con CTA claro de reintento.

## Checklist de QA (fase 1-5)
1. Navegacion en celular:
   - Drawer abre/cierra correctamente.
   - Bottom nav visible y funcional.
2. Ventas en celular:
   - Se puede operar acciones desde tarjetas.
   - Modales no desbordan pantalla.
3. Clientes/Usuarios en celular:
   - Listados legibles sin zoom.
   - Acciones principales con targets tactiles correctos.
4. Fletero:
   - Flujo principal de remito usable desde mobile.
5. Desktop:
   - Sin regresion de sidebar/table layouts existentes.
