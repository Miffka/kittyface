"""Chromium against the compose stack, checked against the Python pipeline.

expected.json comes from scripts/05_score_image.py on fixtures/cats (see backend/AGENTS.md).
"""

import json
from pathlib import Path

import numpy as np
import pytest
from playwright.sync_api import Page, expect

from kittyface.core.geometry import (
    OCULAR_PAIR,
    ear_spread_ratio,
    eye_opening_ratio,
    muzzle_roundness,
    score_ratio,
    whisker_elevation,
)

HERE = Path(__file__).parent
CATS = HERE / "fixtures" / "cats"
EXPECTED = json.loads((HERE / "expected.json").read_text())
THRESHOLDS = Path(__file__).resolve().parents[2] / "models" / "thresholds.json"
VERSION = EXPECTED["threshold_version"]
METRICS = {
    "ear": ear_spread_ratio,
    "orbital": eye_opening_ratio,
    "muzzle": muzzle_roundness,
    "whisker": whisker_elevation,
}
CUTOFFS = {
    u: v["cutoffs"] for u, v in json.loads(THRESHOLDS.read_text())["units"].items()
}
# Browser and Python differ in runtime (onnxruntime-web on ONNX vs OpenVINO on
# tflite) and in resizing (canvas vs cv2), so these can't be exact. Set from the
# worst of cat1-cat7 plus margin; see docs/DECISIONS.md.
# Landmark errors are over the inter-ocular distance; whisker is in degrees.
MEAN_ERR, MAX_ERR, BOX_IOU = 0.01, 0.03, 0.98
RATIO_TOL = {"ear": 0.02, "orbital": 0.01, "muzzle": 0.01, "whisker": 1.5}
# cv2.resize (INTER_LINEAR, aliased on a big downscale) and canvas drawImage feed
# the models different pixels; on cat8 that moves orbital 0.872 -> 0.913, across
# the 0.903 cutoff. Strict, so fixing the resize turns this into a failure.
RESIZE_MISMATCH = pytest.mark.xfail(
    strict=True, reason="cv2 vs canvas resize, see docs/DECISIONS.md"
)


def analyse(page: Page, image: Path) -> None:
    page.goto("/upload")
    page.get_by_role("button", name="I agree").click()
    page.get_by_test_id("file-input").set_input_files(image)
    # The first run downloads both models into wasm sessions.
    expect(page.get_by_role("button", name="Save", exact=True)).to_be_enabled(
        timeout=120_000
    )


def save(page: Page) -> tuple[str, dict]:
    page.get_by_role("button", name="Save", exact=True).click()
    link = page.get_by_role("link", name="View in History")
    upload_id = link.get_attribute("href").rsplit("/", 1)[1]
    return upload_id, api(page, f"/api/v1/uploads/{upload_id}").json()


def api(page: Page, path: str, method: str = "get"):
    token = page.evaluate("localStorage.getItem('cfs.client_token')")
    response = getattr(page.request, method)(path, headers={"X-Client-Token": token})
    assert response.ok, f"{path}: {response.status}"
    return response


def python_measurements(landmarks: list) -> dict[str, tuple[float, int]]:
    shapes = np.asarray(landmarks)[None]
    ratios = {u: float(m(shapes)[0]) for u, m in METRICS.items()}
    return {u: (r, score_ratio(r, u, VERSION, THRESHOLDS)) for u, r in ratios.items()}


def by_unit(measurements: list[dict]) -> dict[str, tuple[float, int]]:
    return {m["unit"]: (m["ratio"], m["score"]) for m in measurements}


def iou(a: list[float], b: list[float]) -> float:
    w = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    h = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    area = lambda r: (r[2] - r[0]) * (r[3] - r[1])
    return w * h / (area(a) + area(b) - w * h)


def table(page: Page) -> dict[str, tuple[str, str]]:
    rows = page.get_by_role("region", name="Measurements").locator("tbody tr")
    cells = [rows.nth(i).locator("td").all_inner_texts() for i in range(4)]
    return dict(zip(METRICS, [(c[1], c[2]) for c in cells], strict=True))


def test_golden_matches_thresholds(page: Page):
    config = page.request.get("/api/v1/config").json()
    assert config["threshold_version"] == VERSION, (
        "thresholds changed: regenerate expected.json"
    )


@pytest.mark.parametrize(
    "name",
    [
        pytest.param(n, marks=RESIZE_MISMATCH) if n == "cat8.jpg" else n
        for n in sorted(EXPECTED["images"])
    ],
)
def test_browser_matches_python(page: Page, name: str):
    golden = EXPECTED["images"][name]
    analyse(page, CATS / name)
    _, detail = save(page)
    meta = detail["metadata"]

    b = meta["detector_box"]
    assert (
        iou([b["x"], b["y"], b["x"] + b["width"], b["y"] + b["height"]], golden["box"])
        >= BOX_IOU
    )

    ours, theirs = np.asarray(meta["model_landmarks"]), np.asarray(golden["landmarks"])
    iod = np.linalg.norm(theirs[OCULAR_PAIR[0]] - theirs[OCULAR_PAIR[1]])
    err = np.linalg.norm(ours - theirs, axis=1) / iod
    assert err.mean() <= MEAN_ERR and err.max() <= MAX_ERR, (
        f"mean {err.mean():.4f}, max {err.max():.4f}"
    )

    stored = by_unit(meta["model_measurements"])
    for unit, (ratio, score) in stored.items():
        expected_ratio = golden["ratios"][unit]
        assert ratio == pytest.approx(expected_ratio, abs=RATIO_TOL[unit]), unit
        # A ratio this close to a cutoff may land on either side; that's not a bug.
        if all(abs(expected_ratio - c) > RATIO_TOL[unit] for c in CUTOFFS[unit]):
            assert score == golden["scores"][unit], unit

    # The TypeScript geometry port, on the browser's own landmarks, without detection noise.
    for unit, (ratio, score) in python_measurements(meta["model_landmarks"]).items():
        assert stored[unit][0] == pytest.approx(ratio, rel=1e-6), unit
        assert stored[unit][1] == score, unit

    # The screen shows what was stored.
    assert meta["user_measurements"] == meta["model_measurements"]
    assert table(page) == {u: (f"{r:.3f}", str(s)) for u, (r, s) in stored.items()}
    region = page.get_by_role("region", name="Measurements")
    for version in (
        meta["model_version"],
        meta["threshold_version"],
        meta["geometry_version"],
    ):
        expect(region).to_contain_text(version)


def test_dragged_landmark_is_saved_and_rescored(page: Page):
    analyse(page, CATS / "cat2.jpg")
    point = page.locator('[data-point="24"]')  # left ear tip
    box = point.bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x - 40, y - 40, steps=5)
    page.mouse.up()
    _, detail = save(page)
    meta = detail["metadata"]

    assert meta["moved_flags"] == [i == 24 for i in range(48)]
    changed = [
        i for i in range(48) if meta["user_landmarks"][i] != meta["model_landmarks"][i]
    ]
    assert changed == [24]
    for key in ("user", "model"):
        stored = by_unit(meta[f"{key}_measurements"])
        for unit, (ratio, score) in python_measurements(
            meta[f"{key}_landmarks"]
        ).items():
            assert stored[unit] == (pytest.approx(ratio, rel=1e-6), score), (key, unit)
    assert (
        by_unit(meta["user_measurements"])["ear"]
        != by_unit(meta["model_measurements"])["ear"]
    )
    assert (
        table(page)["ear"][0] == f"{by_unit(meta['user_measurements'])['ear'][0]:.3f}"
    )


def test_exif_orientation_is_kept_and_metadata_stripped(page: Page):
    analyse(page, CATS / "cat1_exif6.jpg")
    upload_id, detail = save(page)
    assert detail["metadata"]["orientation"] == 6
    image = api(page, f"/api/v1/uploads/{upload_id}/image").body()
    assert image[:2] == b"\xff\xd8" and b"Exif" not in image


def test_history_shows_and_deletes_the_upload(page: Page):
    analyse(page, CATS / "cat3.jpg")
    upload_id, _ = save(page)
    shown = table(page)

    page.goto("/history")
    entry = page.get_by_role("listitem").filter(has_text=upload_id)
    entry.get_by_role("link", name="Open").click()
    expect(page.get_by_role("heading", name="Saved upload")).to_be_visible()
    expect(
        page.get_by_role("region", name="Measurements").locator("tbody tr").first
    ).not_to_contain_text("—")
    assert table(page) == shown

    page.goto("/history")
    entry.get_by_role("button", name="Delete").click()
    page.get_by_role("alertdialog").get_by_role("button", name="Delete").click()
    expect(entry).to_have_count(0)
    assert api(page, "/api/v1/uploads").json() == []
