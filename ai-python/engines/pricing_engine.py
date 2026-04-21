from schemas.pricing import PricingProduct


ROTATION_LOW = 0.05
ROTATION_HIGH = 0.5
ADJUST_UP = 0.05
ADJUST_DOWN = 0.05


def build_price_recommendation(
    product: PricingProduct,
    target_margin: float,
) -> dict:
    costo = max(0.0, float(product.precio_costo))
    precio_actual = max(0.0, float(product.precio_actual))
    rotacion = max(0.0, float(product.rotacion_diaria))

    base_price = costo * (1.0 + float(target_margin)) if costo > 0 else precio_actual
    if rotacion >= ROTATION_HIGH:
        base_price *= 1.0 + ADJUST_UP
    elif 0 < rotacion <= ROTATION_LOW:
        base_price *= max(0.01, 1.0 - ADJUST_DOWN)

    precio_sugerido = round(base_price, 2)
    diferencia = round(precio_sugerido - precio_actual, 2)
    margen_estimado = None
    if precio_sugerido > 0:
        margen_estimado = round((precio_sugerido - costo) / precio_sugerido, 3)

    return {
        "precio_sugerido": precio_sugerido,
        "diferencia": diferencia,
        "margen_estimado": margen_estimado,
        "rotacion_diaria": rotacion,
    }
