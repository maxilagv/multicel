from typing import Optional

from pydantic import BaseModel, Field


class PricingProduct(BaseModel):
    producto_id: int
    producto_nombre: Optional[str] = None
    precio_costo: float = Field(ge=0)
    precio_actual: float = Field(ge=0)
    rotacion_diaria: float = Field(ge=0)


class PricingRequest(BaseModel):
    history_days: int = Field(gt=0)
    target_margin: float = Field(ge=0)
    productos: list[PricingProduct]


class PricingRecommendation(BaseModel):
    producto_id: int
    producto_nombre: Optional[str] = None
    precio_sugerido: float
    diferencia: float
    margen_estimado: Optional[float]
    rotacion_diaria: float


class PricingResponse(BaseModel):
    recomendaciones: list[PricingRecommendation]
