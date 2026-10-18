import json
import secrets

import cv2
import numpy as np
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.db import DATABASE_URL, Upload
from backend.main import app
from backend.store import CONFIG, DEMO_TOKEN, solid_png

client = TestClient(app)
PNG = b"\x89PNG\r\n\x1a\nfake"


def headers(token: str) -> dict:
    return {"X-Client-Token": token}


def consented_token() -> str:
    token = secrets.token_hex(16)
    r = client.post(
        "/api/v1/consent",
        json={"notice_version": CONFIG.notice_version},
        headers=headers(token),
    )
    assert r.status_code == 204
    return token


def metadata(**overrides) -> dict:
    box = {"x": 1, "y": 2, "width": 3, "height": 4}
    measurements = [
        {"unit": u, "ratio": 1.0, "score": 1}
        for u in ["ear", "orbital", "muzzle", "whisker"]
    ]
    return {
        "orientation": 1,
        "detector_box": box,
        "final_box": box,
        "model_landmarks": [[float(i), 0.0] for i in range(48)],
        "user_landmarks": [[float(i), 1.0] for i in range(48)],
        "moved_flags": [i % 2 == 0 for i in range(48)],
        "model_measurements": measurements,
        "user_measurements": measurements,
        "model_version": "m1",
        "threshold_version": CONFIG.threshold_version,
        "geometry_version": "g1",
        "notice_version": CONFIG.notice_version,
    } | overrides


def save(token, meta=None, image=PNG, content_type="image/png"):
    # Same shape as frontend http.ts: metadata is a JSON blob part.
    return client.post(
        "/api/v1/uploads",
        headers=headers(token),
        files={
            "image": ("cat.png", image, content_type),
            "metadata": (
                "metadata.json",
                json.dumps(meta or metadata()),
                "application/json",
            ),
        },
    )


def test_config_needs_no_token():
    r = client.get("/api/v1/config")
    assert r.status_code == 200
    assert r.json()["notice_version"] == CONFIG.notice_version


def test_events_need_no_token():
    event = {
        "model_version": None,
        "backend": None,
        "outcome": "load_failure",
        "load_ms": None,
        "inference_ms": None,
    }
    assert client.post("/api/v1/events", json=event).status_code == 204


def test_uploads_forbidden_without_valid_consented_token():
    assert client.get("/api/v1/uploads").status_code == 403
    assert client.get("/api/v1/uploads", headers=headers("NOT-HEX")).status_code == 403
    unconsented = secrets.token_hex(16)
    assert (
        client.get("/api/v1/uploads", headers=headers(unconsented)).status_code == 403
    )


def test_consent_rejects_wrong_notice_version():
    r = client.post(
        "/api/v1/consent",
        json={"notice_version": "1999-01-01"},
        headers=headers(secrets.token_hex(16)),
    )
    assert r.status_code == 422
    assert r.json() == {"check": "notice_version"}


def test_upload_round_trip():
    token = consented_token()
    assert client.get("/api/v1/uploads", headers=headers(token)).json() == []

    r = save(token)
    assert r.status_code == 201
    upload_id = r.json()["id"]

    detail = client.get(f"/api/v1/uploads/{upload_id}", headers=headers(token)).json()
    sent = metadata()
    assert detail["metadata"]["moved_flags"] == sent["moved_flags"]
    assert detail["metadata"]["user_landmarks"] == sent["user_landmarks"]
    assert detail["metadata"]["user_measurements"] == sent["user_measurements"]

    img = client.get(f"/api/v1/uploads/{upload_id}/image", headers=headers(token))
    assert img.content == PNG
    assert img.headers["content-type"] == "image/png"

    listed = client.get("/api/v1/uploads", headers=headers(token)).json()
    assert [u["id"] for u in listed] == [upload_id]

    path = f"/api/v1/uploads/{upload_id}"
    assert client.delete(path, headers=headers(token)).status_code == 204
    assert client.get(path, headers=headers(token)).status_code == 404


def test_other_token_cannot_see_upload():
    upload_id = save(consented_token()).json()["id"]
    other = consented_token()
    assert client.get("/api/v1/uploads", headers=headers(other)).json() == []
    for path in [f"/api/v1/uploads/{upload_id}", f"/api/v1/uploads/{upload_id}/image"]:
        assert client.get(path, headers=headers(other)).status_code == 404
    path = f"/api/v1/uploads/{upload_id}"
    assert client.delete(path, headers=headers(other)).status_code == 404


def test_save_rejects_bad_input():
    token = consented_token()
    assert save(token, content_type="text/plain").status_code == 415
    assert save(token, image=b"x" * (5 * 1024 * 1024 + 1)).status_code == 413

    r = save(token, metadata(user_landmarks=[[0.0, 0.0]] * 47))
    assert r.status_code == 422
    assert r.json() == {"check": "user_landmarks"}

    r = save(token, metadata(notice_version="1999-01-01"))
    assert r.json() == {"check": "notice_version"}


def test_demo_token_sees_seed_newest_first():
    listed = client.get("/api/v1/uploads", headers=headers(DEMO_TOKEN)).json()
    seeded = [u for u in listed if u["id"].startswith("seed-")]
    assert [u["id"] for u in seeded] == ["seed-3", "seed-2", "seed-1"]
    img = client.get("/api/v1/uploads/seed-1/image", headers=headers(DEMO_TOKEN))
    assert img.content.startswith(b"\x89PNG")


def test_solid_png_decodes_to_its_color():
    png = np.frombuffer(solid_png(3, 2, (200, 140, 80)), np.uint8)
    img = cv2.imdecode(png, cv2.IMREAD_COLOR)
    assert img.shape == (2, 3, 3)
    assert (img == (80, 140, 200)).all()  # OpenCV decodes to BGR


def test_saved_upload_is_in_the_configured_database():
    assert "kittyface_test_" in DATABASE_URL  # conftest's DATABASE_URL was honoured
    upload_id = save(consented_token()).json()["id"]
    # A fresh engine stands in for a restarted server.
    with Session(create_engine(DATABASE_URL)) as session:
        assert session.get(Upload, upload_id).image == PNG
