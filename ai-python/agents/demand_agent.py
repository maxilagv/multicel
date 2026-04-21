from schemas.forecast import (
    ForecastPoint,
    ForecastRequest,
    ForecastResponse,
    ForecastResponseItem,
)
from engines.forecast_engine import build_constant_forecast, compute_daily_average


def run_demand_forecast(req: ForecastRequest) -> ForecastResponse:
    forecasts: list[ForecastResponseItem] = []

    for series_item in req.series:
        history = list(series_item.history or [])
        daily_avg = compute_daily_average(history)
        points = build_constant_forecast(history, req.horizon_days, daily_avg)

        forecasts.append(
            ForecastResponseItem(
                producto_id=series_item.producto_id,
                producto_nombre=series_item.producto_nombre,
                daily_avg=round(daily_avg, 4),
                forecast=[
                    ForecastPoint(fecha=point.fecha, unidades=point.unidades)
                    for point in points
                ],
            )
        )

    return ForecastResponse(forecasts=forecasts)
