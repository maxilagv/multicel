AI Python Service
=================

Descripción
- Microservicio Python para lógica de IA específica del dominio (forecasting y pricing).
- Se comunica vía HTTP con el backend Node de `backend/server`, que actúa como fachada.

Endpoints iniciales
- `POST /forecast`
  - Calcula un pronóstico simple por producto a partir de una serie histórica diaria.
  - Contrato descrito en `backend/server/AI_PYTHON_README.md`.
- `POST /pricing`
  - Calcula recomendaciones de precios a partir de costo, precio actual, rotación y margen objetivo.

Requisitos
- Python 3.10+ recomendado.
- Dependencias principales:
  - `fastapi`
  - `uvicorn[standard]`
  - `pydantic`

Instalación
```bash
cd ai-python
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Ejecución en desarrollo
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Integración con Node
- Configurar en `backend/server/.env`:
  - `LOCAL_AI_URL=http://localhost:8000`
  - `AI_PY_FORECAST=true` (cuando se implemente la llamada desde `aiService.js`)
  - `AI_PY_PRICING=true`
- Node construirá los payloads según `AI_PYTHON_README.md` y llamará a estos endpoints.

Nota
- La lógica actual de estos endpoints es intencionalmente simple (promedio móvil y márgenes básicos) para que el servicio sea funcional desde el primer día.
- En fases posteriores se puede reemplazar por modelos más avanzados (por ejemplo, Prophet, ARIMA, XGBoost, etc.) sin cambiar el contrato de entrada/salida.

