import json
import os
import urllib.error
import urllib.parse
import urllib.request

from services.contracts import DatasetEnvelope


class DataGatewayClient:
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout_seconds: int | None = None,
    ) -> None:
        self.base_url = (base_url or os.getenv("AI_DATA_GATEWAY_URL") or "").rstrip("/")
        self.api_key = api_key or os.getenv("INTERNAL_API_TOKEN") or ""
        self.timeout_seconds = timeout_seconds or int(
            os.getenv("AI_DATA_GATEWAY_TIMEOUT_SECONDS", "8")
        )

    def is_configured(self) -> bool:
        return bool(self.base_url and self.api_key)

    def fetch_dataset(self, dataset: str, params: dict | None = None) -> DatasetEnvelope:
        return DatasetEnvelope.model_validate(
            self._request_json(f"/internal/ai/datasets/{dataset}", params or {})
        )

    def fetch_executive_summary_input(
        self, params: dict | None = None
    ) -> DatasetEnvelope:
        return DatasetEnvelope.model_validate(
            self._request_json("/internal/ai/executive-summary-input", params or {})
        )

    def _request_json(self, path: str, params: dict) -> dict:
        if not self.is_configured():
            raise RuntimeError("AI data gateway is not configured")

        query_string = urllib.parse.urlencode(
            {key: value for key, value in (params or {}).items() if value is not None}
        )
        target = f"{self.base_url}{path}"
        if query_string:
            target = f"{target}?{query_string}"

        request = urllib.request.Request(
            target,
            headers={
                "Accept": "application/json",
                "x-api-key": self.api_key,
            },
            method="GET",
        )

        try:
            with urllib.request.urlopen(
                request,
                timeout=self.timeout_seconds,
            ) as response:
                payload = response.read().decode("utf-8")
                return json.loads(payload or "{}")
        except urllib.error.HTTPError as error:
            payload = error.read().decode("utf-8", errors="ignore")
            raise RuntimeError(
                f"AI data gateway error {error.code}: {payload or 'empty response'}"
            ) from error
