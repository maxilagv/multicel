from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


class HistoryPoint(BaseModel):
    fecha: date
    unidades: float = Field(ge=0)


class SeriesItem(BaseModel):
    producto_id: int
    producto_nombre: Optional[str] = None
    history: list[HistoryPoint]


class ForecastRequest(BaseModel):
    history_days: int = Field(gt=0)
    horizon_days: int = Field(gt=0)
    series: list[SeriesItem]


class ForecastPoint(BaseModel):
    fecha: date
    unidades: float


class ForecastEnginePoint(BaseModel):
    fecha: date
    unidades: float


class ForecastResponseItem(BaseModel):
    producto_id: int
    producto_nombre: Optional[str] = None
    daily_avg: float
    forecast: list[ForecastPoint]


class ForecastResponse(BaseModel):
    forecasts: list[ForecastResponseItem]
