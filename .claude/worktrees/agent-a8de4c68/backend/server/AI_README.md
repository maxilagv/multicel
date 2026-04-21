AI (Fase 1) - Endpoints y Configuración

Endpoints
- GET `/api/ai/forecast` Pronóstico por producto.
  - Query: `days` (def 14), `history` (def 90), `limit`, `stockTargetDays`.
- GET `/api/ai/stockouts` Riesgo de quiebre de stock.
  - Query: `days` (def 14), `history` (def 90), `limit`.
- GET `/api/ai/anomalias` Anomalías en ventas/gastos por z-score.
  - Query: `scope` (sales|expenses|both), `period` (def 90), `sigma` (def 3).
- GET `/api/ai/precios` Precios sugeridos por margen objetivo y rotación.
  - Query: `margin` (def 0.3), `history` (def 90), `limit`.
- GET `/api/ai/insights` Recomendaciones y alertas consolidadas.
  - Query: `days` (def 14), `history` (def 90), `limit` (def 12).
- GET `/api/ai/report-data` Datos estructurados para reporte ejecutivo.
  - Query: `desde`, `hasta`, `history`, `forecast`, `limit`, `top`.
- POST `/api/ai/report-summary` Resumen narrativo con LLM del reporte ejecutivo.
  - Body/Query: `desde`, `hasta`, `history`, `forecast`, `limit`, `top`.
- POST `/api/ai/predictions-summary` Resumen narrativo con LLM de predicciones.
  - Body/Query: `days`, `history`, `limit`, `category_id`.

Variables de entorno (opcionales)
- `AI_STOCK_TARGET_DAYS` (def 30): dÃ­as de cobertura objetivo para sugerir reposiciÃ³n.
- `AI_ANOMALY_SIGMA` (def 3): sensibilidad del z-score.
- `PRICING_TARGET_MARGIN` (def 0.3): margen objetivo base.
- `AI_ROTATION_LOW_PER_DAY` (def 0.05) y `AI_ROTATION_HIGH_PER_DAY` (def 0.5): umbrales de rotación diaria.
- `AI_PRICING_UP_ADJ` (def 0.05) y `AI_PRICING_DOWN_ADJ` (def 0.05): ajustes por rotación.
- `AI_FORECAST_ALPHA` (def 0.35) y `AI_FORECAST_BETA` (def 0.2): smoothing y trend del pronostico.
- `AI_FORECAST_AVG_WINDOW` (def 7): ventana para promedio diario usado en forecast.
- `AI_LEAD_TIME_DAYS` (def 7) y `AI_SERVICE_LEVEL_Z` (def 1.28): safety stock.
- `AI_FORECAST_CACHE_MS` (def 60000) y `AI_INSIGHTS_CACHE_MS` (def 30000): cache de resultados.
- `AI_ALERTS_CONFIG_CACHE_MS` (def 60000): cache de configuracion de alertas.
- `AI_OVERSTOCK_DAYS` (def 90): cobertura minima para alertar sobre stock alto.
- `AI_OVERSTOCK_MIN_DAILY_AVG` (def 0.05): rotacion diaria minima para alertar sobre stock alto.
- `AI_OVERSTOCK_MIN_UNITS` (def 2): ventas minimas en el periodo para alertar sobre stock alto.
- `AI_PRICE_ALERT_PCT` (def 0.08) y `AI_PRICE_ALERT_ABS` (def 0): desvio minimo para alertas de precio.
- `AI_STOCKOUT_DAYS_HIGH` (def 3) y `AI_STOCKOUT_DAYS_MED` (def 7): umbrales de criticidad.
- `AI_REPORT_CACHE_MS` (def 30000): cache para reporte ejecutivo estructurado.

Parametros de sistema (parametros_sistema)
- `deuda_umbral_rojo`: umbral para alertas de deuda.
- `ai_price_alert_pct`, `ai_price_alert_abs`: sobrescriben alertas de precio.
- `ai_overstock_days`, `ai_stockout_days_high`, `ai_stockout_days_med`: umbrales de cobertura.

Notas
- Los endpoints requieren autenticaciÃ³n JWT (middleware `auth`).
- Las consultas excluyen ventas con estado `cancelado`.
- El forecast inicial usa promedio diario simple sobre `history` dÃ­as.
