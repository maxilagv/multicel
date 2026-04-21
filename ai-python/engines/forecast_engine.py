from datetime import date, timedelta

from schemas.forecast import ForecastEnginePoint, HistoryPoint


def compute_daily_average(history: list[HistoryPoint]) -> float:
    values = [max(0.0, float(point.unidades)) for point in history]
    return sum(values) / len(values) if values else 0.0


def build_constant_forecast(
    history: list[HistoryPoint], horizon_days: int, daily_average: float
) -> list[ForecastEnginePoint]:
    horizon = max(1, int(horizon_days))
    last_date = max((point.fecha for point in history), default=date.today())

    return [
        ForecastEnginePoint(
            fecha=last_date + timedelta(days=offset),
            unidades=float(daily_average),
        )
        for offset in range(1, horizon + 1)
    ]
