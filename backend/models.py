from typing import Annotated, Literal

from pydantic import BaseModel, Field

UnitKey = Literal["ear", "orbital", "muzzle", "whisker"]
XY = tuple[float, float]


class UnitThreshold(BaseModel):
    cutoffs: tuple[float, float]
    direction: Literal["ascending", "descending"]


class Units(BaseModel):
    ear: UnitThreshold
    orbital: UnitThreshold
    muzzle: UnitThreshold
    whisker: UnitThreshold


class Thresholds(BaseModel):
    version: str
    units: Units


class AppConfig(BaseModel):
    thresholds: Thresholds
    threshold_version: str
    notice_version: str


class Consent(BaseModel):
    notice_version: str


class DetectionEvent(BaseModel):
    model_version: str | None
    backend: str | None
    outcome: Literal["face", "no_face", "load_failure", "error"]
    load_ms: float | None
    inference_ms: float | None


class Box(BaseModel):
    x: float
    y: float
    width: float
    height: float


class Measurement(BaseModel):
    unit: UnitKey
    ratio: float
    score: Literal[0, 1, 2]


Points = Annotated[list[XY], Field(min_length=48, max_length=48)]
Measurements = Annotated[list[Measurement], Field(min_length=4, max_length=4)]


class UploadMetadata(BaseModel):
    orientation: int = Field(ge=1, le=8)
    detector_box: Box
    final_box: Box
    model_landmarks: Points
    user_landmarks: Points
    moved_flags: Annotated[list[bool], Field(min_length=48, max_length=48)]
    model_measurements: Measurements
    user_measurements: Measurements
    model_version: str
    threshold_version: str
    geometry_version: str
    notice_version: str


class UploadSummary(BaseModel):
    id: str
    created_at: str
    model_version: str
    user_measurements: list[Measurement]


class UploadDetail(UploadSummary):
    metadata: UploadMetadata


class SaveResult(BaseModel):
    id: str
