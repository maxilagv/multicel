from datetime import date, timedelta
from typing import List, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field


class HistoryPoint(BaseModel):
  fecha: date
  unidades: float = Field(ge=0)


class SeriesItem(BaseModel):
  producto_id: int
  producto_nombre: Optional[str] = None
  history: List[HistoryPoint]


class ForecastRequest(BaseModel):
  history_days: int = Field(gt=0)
  horizon_days: int = Field(gt=0)
  series: List[SeriesItem]


class ForecastPoint(BaseModel):
  fecha: date
  unidades: float


class ForecastResponseItem(BaseModel):
  producto_id: int
  producto_nombre: Optional[str] = None
  daily_avg: float
  forecast: List[ForecastPoint]


class ForecastResponse(BaseModel):
  forecasts: List[ForecastResponseItem]


class PricingProduct(BaseModel):
  producto_id: int
  producto_nombre: Optional[str] = None
  precio_costo: float = Field(ge=0)
  precio_actual: float = Field(ge=0)
  rotacion_diaria: float = Field(ge=0)


class PricingRequest(BaseModel):
  history_days: int = Field(gt=0)
  target_margin: float = Field(ge=0)
  productos: List[PricingProduct]


class PricingRecommendation(BaseModel):
  producto_id: int
  producto_nombre: Optional[str] = None
  precio_sugerido: float
  diferencia: float
  margen_estimado: Optional[float]
  rotacion_diaria: float


class PricingResponse(BaseModel):
  recomendaciones: List[PricingRecommendation]


app = FastAPI(title="AI Python Service", version="0.1.0")


def _safe_mean(values: List[float]) -> float:
  return sum(values) / len(values) if values else 0.0


@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest) -> ForecastResponse:
  forecasts: List[ForecastResponseItem] = []

  for serie in req.series:
    units = [max(0.0, float(p.unidades)) for p in serie.history]
    daily_avg = _safe_mean(units)

    # Punto de partida: último día observado o hoy si no hay historia
    if serie.history:
      last_date = max(p.fecha for p in serie.history)
    else:
      last_date = date.today()

    horizon = int(req.horizon_days)
    future: List[ForecastPoint] = []
    for i in range(1, horizon + 1):
      d = last_date + timedelta(days=i)
      # Modelo base: demanda constante = promedio histórico
      future.append(ForecastPoint(fecha=d, unidades=daily_avg))

    forecasts.append(
      ForecastResponseItem(
        producto_id=serie.producto_id,
        producto_nombre=serie.producto_nombre,
        daily_avg=round(daily_avg, 4),
        forecast=future,
      )
    )

  return ForecastResponse(forecasts=forecasts)


@app.post("/pricing", response_model=PricingResponse)
def pricing(req: PricingRequest) -> PricingResponse:
  target_margin = float(req.target_margin)
  recomendaciones: List[PricingRecommendation] = []

  # Parámetros simples para ajustar según rotación
  rot_low = 0.05  # baja rotación
  rot_high = 0.5  # alta rotación
  adj_up = 0.05   # suba adicional cuando rota mucho
  adj_down = 0.05 # baja cuando rota poco

  for p in req.productos:
    costo = max(0.0, float(p.precio_costo))
    precio_actual = max(0.0, float(p.precio_actual))
    rot = max(0.0, float(p.rotacion_diaria))

    # Precio base a partir de margen objetivo
    base = costo * (1.0 + target_margin) if costo > 0 else precio_actual

    # Ajustes por rotación: si rota mucho, subir un poco, si rota poco, bajar
    if rot >= rot_high:
      base *= 1.0 + adj_up
    elif 0 < rot <= rot_low:
      base *= max(0.01, 1.0 - adj_down)

    precio_sugerido = round(base, 2)
    diferencia = round(precio_sugerido - precio_actual, 2)
    margen_estimado = None
    if precio_sugerido > 0:
      margen_estimado = round((precio_sugerido - costo) / precio_sugerido, 3)

    recomendaciones.append(
      PricingRecommendation(
        producto_id=p.producto_id,
        producto_nombre=p.producto_nombre,
        precio_sugerido=precio_sugerido,
        diferencia=diferencia,
        margen_estimado=margen_estimado,
        rotacion_diaria=rot,
      )
    )

  return PricingResponse(recomendaciones=recomendaciones)


@app.get("/health")
def health() -> dict:
  return {"status": "ok"}

