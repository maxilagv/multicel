# Mobile Fases 6 a 10 - Implementacion

## Objetivo
Completar la adaptacion mobile-first con foco en pantallas densas, performance percibida, contrato de datos liviano, trazabilidad operativa y cierre de release para demo.

## Fase 6 - Pantallas densas mobile

### Ventas (`frontend-react/src/pages/Ventas.tsx`)
- Formulario de carga de items:
  - Mobile: tarjetas por item con selector de producto, precio, cantidad y subtotal.
  - Desktop: se mantiene tabla tradicional.
- Detalle de venta:
  - Mobile: tarjetas por item con resumen final (bruto, descuento oferta, neto).
  - Desktop: se mantiene tabla detallada.

### Informes (`frontend-react/src/pages/Informes.tsx`)
- Se consolida el modo mobile por tarjetas en secciones de alta densidad:
  - Ganancias mensuales.
  - Stock bajo.
  - Top productos por cliente.
  - Deudas por cliente.

### Clientes (`frontend-react/src/pages/Clientes.tsx`)
- Cuenta corriente:
  - Mobile: tarjetas de movimiento.
  - Desktop: tabla.
- Historial de pagos y entregas (modal):
  - Mobile: tarjetas accionables.
  - Desktop: tabla.

## Fase 7 - Performance de navegacion y render

### Router lazy-load (`frontend-react/src/routes/AppRouter.tsx`)
- Todas las paginas principales se cargan con `React.lazy` + `Suspense`.
- Fallback consistente de carga por ruta.
- Tipado robusto de wrappers (`ReactNode`) para evitar friccion en composicion.

## Fase 8 - Contrato API mobile liviano

### Backend
- `GET /api/clientes` acepta `view=mobile`:
  - Implementado en:
    - `backend/server/controllers/clientcontroller.js`
    - `backend/server/db/repositories/clientRepository.js`
- `GET /api/ventas` acepta `view=mobile`:
  - Implementado en:
    - `backend/server/controllers/salescontroller.js`
    - `backend/server/db/repositories/salesRepository.js`
  - Version mobile reduce columnas no criticas para listado.

### Frontend
- `Api.clientes` y `Api.ventas` soportan `view: 'mobile' | 'full'`:
  - `frontend-react/src/lib/api.ts`
- Consumo en mobile:
  - `Ventas`: listados cargan con `view=mobile`.
  - `Clientes`: listado y detalle comercial (ventas del cliente) cargan con `view=mobile`.

## Fase 9 - Trazabilidad mobile operativa

### Telemetria de eventos
- `frontend-react/src/lib/mobileTelemetry.ts`
  - Nueva funcion `trackMobileEvent(name, payload)`.
  - Persistencia en `window.__kaisenMobileEvents`.
- Eventos instrumentados:
  - `Ventas`:
    - `ventas_load_success`, `ventas_load_error`
    - `venta_creada`
    - `venta_pago_registrado`
  - `Clientes`:
    - `clientes_load_success`, `clientes_load_error`
    - `cliente_detalle_opened`
  - `Informes`:
    - `informes_excel_descargado`, `informes_excel_error`

## Fase 10 - Cierre de release para demo

### Criterios de salida
1. `npm --prefix frontend-react run typecheck` en verde.
2. Navegacion mobile de extremo a extremo en:
   - Ventas (alta, pago, detalle).
   - Clientes (listado, cuenta corriente, historial).
   - Informes (lectura y exportacion).
3. Sin regresion visible en desktop para tablas y flujos administrativos.

### Checklist QA sugerido (demo)
1. Validar en viewport 360x800 y 390x844.
2. Confirmar targets tactiles minimos en acciones criticas (>= 44px).
3. Crear venta con 3 items desde mobile y registrar pago parcial.
4. Abrir detalle de cliente, revisar cuenta corriente e historial.
5. Descargar excel desde informes y verificar respuesta.
6. Revisar `window.__kaisenMobileVitals` y `window.__kaisenMobileEvents` en consola.
