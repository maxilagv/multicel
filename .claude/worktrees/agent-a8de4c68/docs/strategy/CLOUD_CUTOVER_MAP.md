# Cloud Cutover Map

## Objetivo
Transformar `mi-sistema-nube` a cloud-only sin romper operacion core (auth, usuarios, catalogo, ventas).

## Estado actual aplicado
1. Runtime cloud-only en backend
- Eliminadas banderas `LEGACY_*` del arranque.
- Eliminados mounts y schedulers legacy (licencia, backup archivo, sync bridge, red LAN).

2. Legacy removido del codigo
- Borrados modulos de licencia local.
- Borrados modulos de backup `.sqlite`.
- Borrados modulos de sync local->cloud (`sync_queue`, cloud identity/device).
- Borrado middleware de politica de red local/IP.
- Borrados scripts de generacion de licencia.

3. DB y migraciones
- Adapter MySQL activo en `backend/server/db/pg.js`.
- Runner de migraciones MySQL activo.
- Esquema base cloud aplicado en `V1__core_cloud.sql`.

4. Catalogo y vendedores
- Catalogo publico por `slug` disponible.
- Alta/listado de vendedores soportado por API cloud.

## Mapa por fases restantes
## Fase A (estabilizacion)
- Congelar cualquier endpoint que dependa de SQL legacy no migrado.
- Priorizar hardening en modulos de alto trafico: ventas, compras, reportes.
- Resultado esperado: errores 5xx ~0 en flujos criticos.

## Fase B (frontend nuevo)
- Implementar frontend desde cero (Vercel) contra contrato cloud.
- Empezar por: Login -> Dashboard -> Catalogo -> Usuarios vendedores -> Ventas.
- Resultado esperado: flujo comercial completo sin Electron.

## Fase C (tenancy real)
- Introducir `tenant_id` por tabla dominio.
- Aplicar aislamiento por tenant en repositorios y JWT claims.
- Resultado esperado: multiempresa seguro y auditable.

## Fase D (operacion y observabilidad)
- Alertas sobre `5xx`, latencia p95, errores de login.
- Retencion de logs y panel de salud operativo.
- Resultado esperado: deteccion temprana antes de incidentes de negocio.

## Riesgos y controles (cero sorpresas)
1. Riesgo: regresion por limpieza legacy.
Control: smoke E2E obligatorio por release (setup/login/vendedor/catalogo).

2. Riesgo: queries legacy no compatibles MySQL en modulos menos usados.
Control: activar pruebas por dominio y canary con trafico bajo.

3. Riesgo: frontend nuevo consuma endpoints fuera de contrato.
Control: congelar contrato API y versionarlo en `docs/cloud/CONTRACT.md`.

4. Riesgo: despliegue con configuracion incorrecta.
Control: checklist previa de `.env` + migracion + healthcheck + rollback.

## Checklist Go/No-Go de release
- `npm run migrate` sin errores.
- `GET /api/healthz` => `200` y `db=ok`.
- Login admin y login vendedor OK.
- Alta vendedor OK.
- Catalogo publico por slug OK.
- Sin referencias activas a modulos legacy.
