AI (Fase 2) - Microservicio Python y Contrato

Objetivo
- Desacoplar la lógica de modelos avanzados (forecasting, pricing, scoring) en un servicio Python separado.
- Mantener el backend Node como fachada: Node extrae datos de Postgres, llama a Python y adapta la respuesta al contrato actual de la API (`/api/ai/*`).

Casos de uso iniciales
- Forecast de demanda por producto (mejor que promedio simple).
- Recomendación de precios por producto según costo, rotación y margen objetivo.

Arquitectura
- Nuevo servicio `ai-python` (FastAPI o similar) levantado en un puerto interno, por ejemplo `http://localhost:8000`.
- Backend Node (`backend/server`) se comunica con Python vía HTTP usando la variable `LOCAL_AI_URL`.
- Feature flags en Node:
  - `AI_PY_FORECAST=true|false`: activa/desactiva uso del microservicio para `/api/ai/forecast` y `/api/ai/stockouts`.
  - `AI_PY_PRICING=true|false`: activa/desactiva uso del microservicio para `/api/ai/precios`.
  - En caso de error o flag en `false`, Node cae al comportamiento actual (cálculo simple en `aiService.js`).

Contrato /forecast
- Endpoint Python: `POST /forecast`

Request (ejemplo):
```json
{
  "history_days": 90,
  "horizon_days": 14,
  "series": [
    {
      "producto_id": 1,
      "producto_nombre": "Silla X",
      "history": [
        { "fecha": "2025-01-01", "unidades": 3 },
        { "fecha": "2025-01-02", "unidades": 0 },
        { "fecha": "2025-01-03", "unidades": 5 }
      ]
    }
  ]
}
```

Response (ejemplo):
```json
{
  "forecasts": [
    {
      "producto_id": 1,
      "producto_nombre": "Silla X",
      "daily_avg": 2.67,
      "forecast": [
        { "fecha": "2025-02-01", "unidades": 2.7 },
        { "fecha": "2025-02-02", "unidades": 2.7 }
      ]
    }
  ]
}
```

Adaptación en Node:
- `aiService.forecastByProduct` y `aiService.stockouts` seguirán respondiendo en el formato actual:
  - `{ producto_id, producto_nombre, daily_avg, forecast_units, disponible, cobertura_dias, sugerido_reponer }`
- Node se encargará de:
  - Construir `series` por producto (ventas diarias) con SQL (similar a `forecastDetail` pero masiva).
  - Llamar a `/forecast`.
  - Convertir la respuesta a la lista actual usada por el frontend (Predicciones y Dashboard).

Contrato /pricing
- Endpoint Python: `POST /pricing`

Request (ejemplo):
```json
{
  "history_days": 90,
  "target_margin": 0.3,
  "productos": [
    {
      "producto_id": 1,
      "producto_nombre": "Silla X",
      "precio_costo": 10.0,
      "precio_actual": 15.0,
      "rotacion_diaria": 0.25
    }
  ]
}
```

Response (ejemplo):
```json
{
  "recomendaciones": [
    {
      "producto_id": 1,
      "producto_nombre": "Silla X",
      "precio_sugerido": 16.5,
      "diferencia": 1.5,
      "margen_estimado": 0.39,
      "rotacion_diaria": 0.25
    }
  ]
}
```

Adaptación en Node:
- `aiService.pricingRecommendations` mantendrá el formato de respuesta actual:
  - `{ producto_id, producto_nombre, precio_actual, precio_sugerido, diferencia, margen_estimado, rotacion_diaria }`
- Node construirá la lista de productos con costo, precio actual y rotación, llamará a `/pricing`, y adaptará la respuesta.

Variables de entorno relevantes (Node)
- `LOCAL_AI_URL=http://localhost:8000` (u otra URL donde corra `ai-python`).
- `AI_PY_FORECAST=true|false` (usa/no usa `/forecast`).
- `AI_PY_PRICING=true|false` (usa/no usa `/pricing`).
 - `AI_PY_TIMEOUT_MS` (timeout en ms para llamadas desde Node al microservicio; por defecto 5000).

Estado actual
- Esta fase define el contrato y la estructura del microservicio Python y agrega la carpeta `ai-python` con un servicio funcional básico.
- La lógica actual en `services/aiService.js` sigue siendo la fuente de verdad para `/api/ai/*` (no se ha modificado).
- El cambio de implementación (usar realmente Python desde Node) se hará en una fase posterior, detrás de flags, para no romper el comportamiento existente.
