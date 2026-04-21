# Fases 0-3 - Senior Playbook de Ejecucion

## Objetivo del paquete
Convertir el sistema en un ERP inteligente operable por dueno/gerencia con disciplina de programa grande:

1. Una sola verdad de negocio (precios, comisiones, metricas).
2. Reglas de ejecucion sin ambiguedad entre equipos.
3. Riesgo operativo controlado con gates Go/No-Go.

---

## Fase 0 - Owner OS (Sistema Operativo del Dueno)

### North Star
`Caja sana + margen sano + crecimiento sano`

### 8 KPIs obligatorios (con owner)
| KPI | Formula operativa | Fuente | Owner | Frecuencia |
|---|---|---|---|---|
| Caja proyectada 30d | Caja actual + neto diario esperado * 30 | Finanzas + cobros/pagos | CFO/Finanzas | Diario |
| Margen neto | (Ventas - Costo - Gastos - Impuestos) / Ventas | Ventas + costos + gastos | Gerencia | Diario |
| Deuda vencida >90 | Sumatoria deuda atrasada >90 dias | Clientes/deudas | Cobranzas | Diario |
| Quiebres evitables | Productos con cobertura por debajo de umbral | Stock + ventas | Operaciones | Diario |
| Rotacion inventario | Unidades vendidas / stock promedio | Stock + ventas | Operaciones | Semanal |
| Efectividad ofertas | Margen incremental neto por oferta | Ofertas + ventas_detalle | Comercial | Semanal |
| Cumplimiento comision | Diferencia entre comision esperada y pagada | Ventas_detalle + pagos vendedores | RRHH/Finanzas | Semanal |
| Retencion clientes | Clientes activos t / clientes activos t-1 | CRM + ventas | Growth | Mensual |

### Guardrails no negociables
1. Sin margen por debajo del minimo definido por categoria.
2. Sin caja proyectada negativa sin plan de accion aprobado.
3. Sin descuentos fuera de politica de aprobacion.
4. Sin override de precio sin trazabilidad.
5. Sin cambios de comision sin auditoria y fecha de vigencia.

### Rituales de gestion
1. Diario (15 min): salud de caja, top alertas, 3 acciones.
2. Semanal (45 min): desvio de KPIs, performance de ofertas, cartera vencida.
3. Mensual (90 min): comparativo vs baseline, decisiones de pricing/comercial.

### Artefactos de salida
1. Owner Scorecard (single page).
2. Diccionario de metricas v1 (fuente + formula + semantica).
3. Matriz de decisiones (if-this-then-that).
4. Objetivos numericos 90 dias por KPI.

---

## Fase 1 - Blindaje de precios y comisiones

### Principios
1. Backend autoritativo para precio de venta.
2. Frontend no puede imponer precio por encima/debajo de reglas.
3. Comision liquidada desde hechos contables (`ventas_detalle`), no desde estimaciones de UI.

### Cambios aplicados en codigo
1. `salesRepository.createVenta`: precio unitario se calcula por `price_list_type` en servidor.
2. `salesRepository.createVenta`: si no hay precio valido para la lista, la venta falla.
3. `Ventas.tsx`: input de precio en alta de venta queda de solo lectura (precio automatico por lista).
4. `vendorPayrollController.listSueldos`: se informa `comision_porcentaje` efectivo real.
5. `vendorPayrollController.createPago`: guarda porcentaje efectivo real del periodo.

### Criterio de aceptacion
1. Ninguna venta acepta precio manual por API para romper la lista.
2. Vendedor ve porcentaje de comision efectivo consistente con monto calculado.
3. Auditoria comercial puede reproducir precio y comision de cada linea.

### Riesgos y mitigacion
1. Riesgo: productos sin precio en alguna lista.
2. Mitigacion: validacion de data y alerta de configuracion antes de venta.

---

## Fase 2 - Unificacion de listas de precios

### Problema actual
Hay dos modelos coexistiendo:
1. `price_list_type` operativo en venta (`local/distribuidor/final`).
2. `price_lists` + `price_list_rules` en Finanzas (simulacion/estrategia).

### Objetivo de arquitectura
Una sola ruta de pricing en transaccion de venta:
1. Venta referencia `price_list_id`.
2. Snapshot de reglas aplicadas por linea en `ventas_detalle`.
3. Comision por lista usa mismo identificador de lista.

### Plan de migracion (sin downtime)
1. M1: agregar `price_list_id` nullable en `ventas`.
2. M2: mapear listas base (`local/distribuidor/final`) a `price_lists` canonicas.
3. M3: resolver precio por motor de reglas unificado.
4. M4: persistir snapshot de regla/precio por item.
5. M5: deprecar dependencia directa de `price_list_type`.

### DoD (Definition of Done)
1. Toda venta queda trazada con lista y regla aplicada.
2. PDF/catalogo/ofertas comparten diccionario de listas unico.
3. Comision por lista usa la misma entidad canonica.

---

## Fase 3 - Analytics V2 (precision y accionabilidad)

### Principios de modelado
1. Dataset operativo confiable: usar eventos reales de negocio.
2. Separar capa semantica (KPI) de capa de visualizacion.
3. Medir precision, no solo mostrar graficos.

### Cambios aplicados en codigo
1. `aiService.getSalesQtyByProduct`: ahora filtra ventas entregadas y no ocultas.
2. `aiService.getSalesSeriesBundle`: series por fecha efectiva de entrega (`fecha_entrega` fallback `fecha`) y ventas entregadas/no ocultas.
3. `aiService.forecastDetail`: misma regla de fecha y filtros confiables.
4. `aiService.anomalies(sales)`: excluye canceladas, ocultas y no entregadas; usa fecha efectiva.

### Siguiente ola (backlog de precision)
1. Backtesting automatico por categoria/canal/horizonte.
2. Score de precision por modelo (MAPE/WAPE/BIAS).
3. Alertas explicables con impacto economico estimado.
4. Segmentacion temporal (dia habil, estacionalidad, promo days).

### KPIs tecnicos de Fase 3
1. WAPE forecast (global y por top categorias).
2. Precision de alertas (alerta valida / alerta total).
3. Tiempo de latencia de tablero.
4. Cobertura de datos validos.

---

## Modelo de trabajo (senior squad)

### Estructura recomendada
1. Product Lead (dueño de valor de negocio).
2. Tech Lead Backend (pricing/comisiones/datos).
3. Tech Lead Frontend (UX de decision para dueno).
4. Data Lead (semantica, forecast, calidad de datos).
5. QA Lead (criterios de release gates A/B/C/D).

### Cadencia de ejecucion
1. Sprint quincenal con demo obligatoria de impacto en KPI.
2. Control semanal de deuda tecnica y riesgos.
3. Release mensual con changelog de negocio.

### Gate de avance
No se cierra fase sin:
1. Gate A (calidad) en verde.
2. Gate B (confiabilidad) en verde.
3. Gate C (valor) con tendencia positiva.
4. Gate D (documentacion/handover) completo.

