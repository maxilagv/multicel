from pydantic import BaseModel, Field


class DatasetEnvelope(BaseModel):
    dataset: str
    schema_version: str = Field(min_length=1)
    generated_at: str
    hash: str = Field(min_length=8)
    records_used: int = Field(ge=0)
    filters_used: dict = Field(default_factory=dict)
    scope: dict = Field(default_factory=dict)
    summary: dict = Field(default_factory=dict)
    records: list = Field(default_factory=list)
    collections: dict = Field(default_factory=dict)
