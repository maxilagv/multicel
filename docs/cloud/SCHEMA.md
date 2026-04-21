# Cloud schema (MySQL)

Fuente: `backend/database/migrations_mysql/V1__core_cloud.sql`

## Tablas base
- `_migrations`
- `roles`
- `usuarios`
- `auth_refresh_tokens`
- `jwt_blacklist`
- `logs`
- `parametros_sistema`

## Operacion comercial
- `categorias`
- `productos`
- `producto_imagenes`
- `clientes`
- `proveedores`
- `ventas`
- `ventas_detalle`
- `pagos`
- `metodos_pago`
- `pagos_metodos`
- `compras`
- `compras_detalle`

## Inventario
- `depositos`
- `usuarios_depositos`
- `inventario_depositos`
- `movimientos_stock`
- `zonas`

## Vistas
- `inventario`
- `vista_deudas`

## Notas de cloud-only
- No existe `sync_queue` en el esquema cloud.
- No hay tablas de licencia por instalacion.
- El catalogo publico usa configuracion en `parametros_sistema` (incluyendo `catalogo_slug`).

## Convenciones operativas
- Todas las migraciones nuevas deben ir en `backend/database/migrations_mysql`.
- El runner oficial es `npm run migrate` en `backend/server`.
