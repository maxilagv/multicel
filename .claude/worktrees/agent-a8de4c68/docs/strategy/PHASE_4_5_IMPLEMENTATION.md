# Fase 4 y 5 - Implementacion Tecnica

Este modulo agrega capacidades ejecutables para acelerar valor diario de dueno/gerencia sin romper flujos existentes.

## Endpoints Fase 4
- `GET /api/duenio/cobranzas/ranking-riesgo`
- `POST /api/duenio/cobranzas/recordatorios/auto`
- `GET /api/duenio/cobranzas/recordatorios`
- `GET /api/duenio/cobranzas/promesas`
- `POST /api/duenio/cobranzas/promesas`
- `PUT /api/duenio/cobranzas/promesas/:id/estado`
- `GET /api/duenio/margenes/tiempo-real`
- `GET /api/duenio/repricing/reglas`
- `POST /api/duenio/repricing/reglas`
- `PUT /api/duenio/repricing/reglas/:id`
- `POST /api/duenio/repricing/preview`
- `POST /api/duenio/repricing/aplicar`
- `GET /api/duenio/centro-mando`
- `GET /api/duenio/alertas`
- `POST /api/duenio/alertas/:id/dismiss`

## Endpoints Fase 5
- `GET /api/duenio/fiscal-ar/reglas`
- `POST /api/duenio/fiscal-ar/reglas`
- `PUT /api/duenio/fiscal-ar/reglas/:id`
- `POST /api/duenio/fiscal-ar/simular`
- `GET /api/duenio/listas-precios`
- `POST /api/duenio/listas-precios`
- `PUT /api/duenio/listas-precios/:id`
- `GET /api/duenio/listas-precios/:id/reglas`
- `POST /api/duenio/listas-precios/:id/reglas`
- `PUT /api/duenio/listas-precios/reglas/:ruleId`
- `POST /api/duenio/listas-precios/:id/preview`
- `GET /api/duenio/integraciones/canales`
- `PUT /api/duenio/integraciones/canales/:canal`
- `POST /api/duenio/integraciones/canales/:canal/sync`
- `GET /api/duenio/integraciones/jobs`
- `GET /api/duenio/beta/empresas`
- `POST /api/duenio/beta/empresas`
- `POST /api/duenio/beta/empresas/:id/feedback`
- `GET /api/duenio/beta/metricas`
- `GET /api/duenio/release-train/ciclos`
- `POST /api/duenio/release-train/ciclos`
- `POST /api/duenio/release-train/ciclos/:id/entries`
- `POST /api/duenio/release-train/ciclos/:id/cerrar`

## Tablas nuevas
Migracion: `backend/database/migrations_sqlite/V13__owner_intelligence_and_growth.sql`

- cobranzas: `cobranza_promesas`, `cobranza_recordatorios`, `cobranza_riesgo_snapshots`
- pricing: `repricing_rules`, `price_lists`, `price_list_rules`
- alertas: `owner_alerts`
- fiscal AR: `fiscal_ar_rules`
- canales: `channel_integrations`, `channel_sync_jobs`
- beta/release: `beta_program_companies`, `beta_feedback`, `release_train_cycles`, `release_changelog_entries`

## Frontend API
Se agregaron helpers en `frontend-react/src/lib/api.ts` bajo prefijo `owner*` para consumir el modulo completo.
