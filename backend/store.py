"""In-memory state. Lost on restart."""

import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import cv2
import numpy as np

from backend.models import AppConfig, Box, Measurement, UploadMetadata

CONFIG = AppConfig.model_validate(
    {
        "threshold_version": "mock-thresholds-0.1.0",
        "notice_version": "2026-10-04",
        "thresholds": {
            "version": "mock-thresholds-0.1.0",
            "units": {
                "ear": {"cutoffs": [1.0, 1.3], "direction": "descending"},
                "orbital": {"cutoffs": [0.3, 0.42], "direction": "descending"},
                "muzzle": {"cutoffs": [0.42, 0.5], "direction": "ascending"},
                "whisker": {"cutoffs": [1.1, 1.25], "direction": "ascending"},
            },
        },
    }
)


@dataclass
class Upload:
    id: str
    token: str
    created_at: str
    metadata: UploadMetadata
    image: bytes
    content_type: str


consents: dict[str, str] = {}
uploads: dict[str, Upload] = {}
events: list = []

# Paste this into the frontend's localStorage token to see the seed data.
DEMO_TOKEN = "0" * 32


def seed() -> None:
    consents[DEMO_TOKEN] = CONFIG.notice_version
    now = datetime.now(UTC)
    for i, (ratios, scores, color) in enumerate(
        [
            ([1.4, 0.45, 0.40, 1.05], [0, 0, 0, 0], (80, 140, 200)),
            ([1.15, 0.35, 0.46, 1.18], [1, 1, 1, 1], (120, 120, 120)),
            ([0.9, 0.25, 0.55, 1.3], [2, 2, 2, 2], (40, 70, 110)),
        ]
    ):
        box = Box(x=40, y=30, width=240, height=200)
        cx, cy = box.x + box.width / 2, box.y + box.height / 2
        points = [
            (
                cx + 0.4 * box.width * math.cos(2 * math.pi * k / 48),
                cy + 0.4 * box.height * math.sin(2 * math.pi * k / 48),
            )
            for k in range(48)
        ]
        measurements = [
            Measurement(unit=u, ratio=r, score=s)
            for u, r, s in zip(
                ["ear", "orbital", "muzzle", "whisker"], ratios, scores, strict=True
            )
        ]
        png = cv2.imencode(".png", np.full((260, 320, 3), color, np.uint8))[1]
        upload_id = f"seed-{i + 1}"
        uploads[upload_id] = Upload(
            id=upload_id,
            token=DEMO_TOKEN,
            created_at=(now - timedelta(days=3 - i)).isoformat(),
            metadata=UploadMetadata(
                orientation=1,
                detector_box=box,
                final_box=box,
                model_landmarks=points,
                user_landmarks=points,
                moved_flags=[False] * 48,
                model_measurements=measurements,
                user_measurements=measurements,
                model_version="seed",
                threshold_version=CONFIG.threshold_version,
                geometry_version="seed",
                notice_version=CONFIG.notice_version,
            ),
            image=png.tobytes(),
            content_type="image/png",
        )


seed()
