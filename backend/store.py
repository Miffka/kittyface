"""App config and demo seed data."""

import json
import math
import struct
import zlib
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from backend.db import Consent, Upload
from backend.models import AppConfig, Box, Measurement, UploadMetadata

# Written by scripts/04_fit_thresholds.py; its extra "fit" keys are ignored.
THRESHOLDS = json.loads(
    (Path(__file__).resolve().parents[1] / "models" / "thresholds.json").read_text()
)
CONFIG = AppConfig.model_validate(
    {
        "threshold_version": THRESHOLDS["version"],
        "notice_version": "2026-10-04",
        "thresholds": THRESHOLDS,
    }
)


def solid_png(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    """A one-color 8-bit RGB PNG, so the seed needs no image library."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    rows = (b"\0" + bytes(rgb) * width) * height
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )


# Paste this into the frontend's localStorage token to see the seed data.
DEMO_TOKEN = "0" * 32


def seed(session: Session) -> None:
    """Idempotent: merge overwrites the same rows on every start."""
    session.merge(Consent(token=DEMO_TOKEN, notice_version=CONFIG.notice_version))
    now = datetime.now(UTC)
    for i, (ratios, scores, color) in enumerate(
        [
            ([1.6, 0.92, 0.45, 16.0], [0, 0, 0, 0], (200, 140, 80)),
            ([1.85, 0.85, 0.40, 21.15], [1, 1, 1, 1], (120, 120, 120)),
            ([2.2, 0.6, 0.36, 26.0], [2, 2, 2, 2], (110, 70, 40)),
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
                image=solid_png(320, 260, color),
                content_type="image/png",
            )
        )
    session.commit()
