from fastapi import FastAPI

from agents.demand_agent import run_demand_forecast
from agents.pricing_agent import run_pricing_review
from schemas.forecast import ForecastRequest, ForecastResponse
from schemas.pricing import PricingRequest, PricingResponse
from services.health_service import get_health_payload


app = FastAPI(title="AI Python Service", version="0.2.0")


@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest) -> ForecastResponse:
    return run_demand_forecast(req)


@app.post("/pricing", response_model=PricingResponse)
def pricing(req: PricingRequest) -> PricingResponse:
    return run_pricing_review(req)


@app.get("/health")
def health() -> dict:
    return get_health_payload()
