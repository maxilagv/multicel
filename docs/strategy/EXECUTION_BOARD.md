# Execution Board

| Fase | Objetivo | Estado | Owner sugerido | Fecha objetivo |
|---|---|---|---|---|
| Fase 0 | Direccion de producto y reglas de ejecucion | En curso | Product Lead | Semana 1 |
| Fase 1 | Estabilidad y resiliencia critica | En curso | Tech Lead Backend | Semanas 2-4 |
| Fase 2 | Calidad enterprise y mantenibilidad | En curso | Tech Lead Frontend + QA | Semanas 5-8 |
| Fase 3 | Motor de ofertas orientado a margen | Pendiente | Product + Backend + Frontend | Semanas 9-12 |
| Fase 4 | Cobranzas inteligentes + centro de mando | Completada | Product + Finance + Backend | Semanas 13-16 |
| Fase 5 | Diferenciacion AR + escalado comercial | Completada | Product + Partnerships + Backend | Semanas 17-24 |

## Checklist rapido por fase

### Fase 0
- [x] PRD base.
- [x] KPIs obligatorios definidos.
- [x] Gates Go/No-Go definidos.
- [x] Roadmap por fases documentado.
- [x] Blueprint `Owner OS` (scorecard, guardrails, rituales de gestion).

### Fase 1
- [x] Fix validacion de password en login.
- [x] Recuperacion de eventos `processing` huerfanos en cloud sync.
- [x] Backoff exponencial + limite de reintentos en cloud sync.
- [x] `idempotency_key` por evento de sync.
- [x] Fix query duplicada en ordenes.
- [x] Alineacion docs CRM.
- [x] Endpoint de rotacion de token cloud.
- [x] Precio de venta gobernado por backend segun lista seleccionada.
- [x] UI de ventas alineada a precio automatico por lista (sin edicion manual).
- [x] Porcentaje efectivo de comision visible en liquidacion de vendedores.
- [ ] Rotacion real de secretos en entornos.

### Fase 2
- [x] Scripts `lint` y `test` agregados en frontend.
- [x] Config ESLint/Prettier/Vitest agregada.
- [x] Strict staged (`tsconfig.strict.json`) agregado.
- [ ] Split de archivos gigantes por dominio.
- [ ] Cobertura de tests backend en modulos criticos.

### Fase 3
- [ ] Diseno funcional completo de motor de ofertas.
- [ ] Modelo de datos y reglas de apilamiento.
- [ ] Simulador de impacto.
- [ ] Integracion ventas/caja/catalogo.
- [ ] Dashboard de performance de ofertas.
- [x] Consistencia de dataset IA: ventas entregadas/no ocultas para forecast e insights.

### Fase 4
- [x] Ranking de riesgo de mora por cliente.
- [x] Recordatorios y promesas de pago.
- [x] Margenes en tiempo real por dimension.
- [x] Repricing por reglas comerciales.
- [x] Centro de mando con caja 7/30/90 y alertas.
- [x] Tutorial escrito en Finanzas para interpretar metricas y tomar acciones.

### Fase 5
- [x] Base fiscal AR parametrizable.
- [x] Listas de precios multi-regla.
- [x] Base de integraciones de canales con cola de jobs.
- [x] Modulo beta (empresas + feedback + metricas).
- [x] Release train mensual con changelog de negocio.
- [x] PDF de catalogo en modo ofertas con imagen de oferta y vista previa en panel.
