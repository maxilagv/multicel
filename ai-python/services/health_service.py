from services.data_gateway_client import DataGatewayClient


def get_health_payload() -> dict:
    data_gateway = DataGatewayClient()
    return {
        "status": "ok",
        "runtime": {
            "agents": ["demand_agent", "pricing_agent"],
            "engines": ["forecast_engine", "pricing_engine"],
            "evaluations": ["forecast_metrics", "pricing_metrics"],
        },
        "data_gateway": {
            "configured": data_gateway.is_configured(),
        },
    }
