"""App config and demo seed data."""

import math
from datetime import UTC, datetime, timedelta

import cv2
import numpy as np
from sqlalchemy.orm import Session

from backend.db import Consent, Upload
from backend.models import AppConfig, Box, Measurement, UploadMetadata

CONFIG = AppConfig.model_validate(
    {
        "threshold_version": "mock-thresholds-0.1.0",
        "notice_version": "2026-10-04",
        "thresholds": {
            "version": "mock-thresholds-0.1.0",
            "units": {
                "ear": {"cutoffs": [1.9, 2.2], "direction": "ascending"},
                "orbital": {"cutoffs": [0.35, 0.55], "direction": "descending"},
                "muzzle": {"cutoffs": [0.3, 0.4], "direction": "descending"},
                "whisker": {"cutoffs": [10.0, 25.0], "direction": "ascending"},
            },
        },
    }
)


# Paste this into the frontend's localStorage token to see the seed data.
DEMO_TOKEN = "0" * 32


def seed(session: Session) -> None:
    """Idempotent: merge overwrites the same rows on every start."""
    session.merge(Consent(token=DEMO_TOKEN, notice_version=CONFIG.notice_version))
    now = datetime.now(UTC)
    for i, (ratios, scores, color) in enumerate(
        [
            ([1.7, 0.7, 0.45, 5.0], [0, 0, 0, 0], (80, 140, 200)),
            ([2.0, 0.45, 0.35, 18.0], [1, 1, 1, 1], (120, 120, 120)),
            ([2.4, 0.3, 0.25, 30.0], [2, 2, 2, 2], (40, 70, 110)),
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
        session.merge(
            Upload(
                id=upload_id,
                token=DEMO_TOKEN,
                created_at=(now - timedelta(days=3 - i)).isoformat(),
                meta=UploadMetadata(
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
                ).model_dump(mode="json"),
                image=png.tobytes(),
                content_type="image/png",
            )
        )
    session.commit()
