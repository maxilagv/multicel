# Fases 8, 9 y 10 - Cierre tecnico y operativo

Este documento deja trazabilidad de los cambios aplicados para cerrar las fases 8 a 10 sobre el modulo de ventas/remitos/ofertas/comisiones/fletero.

## Fase 8 - Seguridad y permisos duros

### Objetivo
- Garantizar que el rol `fletero` tenga acceso minimo: solo ver ventas y descargar remitos.

### Backend aplicado
- `backend/server/middlewares/authmiddleware.js`
  - Restriccion explicita para `fletero`:
    - `GET /api/ventas`
    - `GET /api/reportes/remito/:id.pdf`
    - `POST /api/logout`
  - Cualquier otro endpoint responde `403`.
- `backend/server/routes/salesroutes.js`
  - `GET /ventas` exige rol `admin|gerente|vendedor|fletero`.
  - `GET /ventas/:id/detalle` exige rol `admin|gerente|vendedor`.
- `backend/server/routes/reportroutes.js`
  - `GET /reportes/remito/:id.pdf` exige rol `admin|gerente|vendedor|fletero`.

### Frontend aplicado
- `frontend-react/src/pages/Ventas.tsx`
  - Si el usuario es `fletero`, la carga inicial solo consume `Api.ventas()`.
  - No consulta clientes/productos/depositos/metodos de pago/arca para evitar llamados fuera de permiso.
  - Mantiene UI limitada a descarga de remito.

## Fase 9 - Trazabilidad comercial

### Objetivo
- Mostrar en detalle de venta que lista de precios y oferta impactaron cada item.

### Backend aplicado
- `backend/server/db/repositories/salesRepository.js`
  - `getVentaDetalle` ahora retorna:
    - `lista_precio_codigo`
    - `oferta_precio_id`
    - `oferta_nombre`
    - `oferta_tipo`
    - `descuento_oferta`
    - `descuento_oferta_pct`
    - `subtotal_neto`

### Frontend aplicado
- `frontend-react/src/pages/Ventas.tsx`
  - Modal de detalle muestra:
    - Lista aplicada por item.
    - Oferta aplicada por item (nombre e impacto %).
    - Subtotal bruto, descuento de oferta y subtotal neto.
  - Header del detalle muestra lista de precios de la venta.

## Fase 10 - Cierre de calidad de release

### Verificaciones ejecutadas
- `node --check` en:
  - `backend/server/middlewares/authmiddleware.js`
  - `backend/server/routes/salesroutes.js`
  - `backend/server/routes/reportroutes.js`
  - `backend/server/db/repositories/salesRepository.js`
- `npm --prefix frontend-react run typecheck`

### Resultado
- Cambios compilables y listos para QA funcional.

## Checklist QA sugerido
1. Login con `fletero`:
   - Puede abrir `/app/ventas`.
   - Puede descargar remito.
   - No puede crear venta, registrar pago, ver detalle, ni acceder a otros modulos.
2. Login con `admin/gerente/vendedor`:
   - Flujo normal de ventas sin regresiones.
   - Detalle muestra trazabilidad completa de oferta/lista.
3. Validar remito PDF:
   - Descarga correcta desde ventas para todos los roles habilitados.
