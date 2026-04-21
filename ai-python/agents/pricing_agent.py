from schemas.pricing import (
    PricingRecommendation,
    PricingRequest,
    PricingResponse,
)
from engines.pricing_engine import build_price_recommendation


def run_pricing_review(req: PricingRequest) -> PricingResponse:
    recomendaciones: list[PricingRecommendation] = []

    for product in req.productos:
        recommendation = build_price_recommendation(
            product=product,
            target_margin=req.target_margin,
        )
        recomendaciones.append(
            PricingRecommendation(
                producto_id=product.producto_id,
                producto_nombre=product.producto_nombre,
                precio_sugerido=recommendation["precio_sugerido"],
                diferencia=recommendation["diferencia"],
                margen_estimado=recommendation["margen_estimado"],
                rotacion_diaria=recommendation["rotacion_diaria"],
            )
        )

    return PricingResponse(recomendaciones=recomendaciones)
