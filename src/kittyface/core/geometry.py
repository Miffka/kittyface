from collections.abc import Sequence

import cv2
import numpy as np

BoxXYXY = tuple[float, float, float, float]

# Landmark index groups for the 48-point Finka/CatFLW scheme. Canonical home
# for both tracks: `catface.ml.plausibility` re-exports these rather than
# keeping its own copy (AGENTS.md).
LEFT_EYE = (3, 4, 5, 6, 7, 36, 37, 38)
RIGHT_EYE = (1, 8, 9, 10, 11, 39, 40, 41)
EYE = LEFT_EYE + RIGHT_EYE
LEFT_EAR = (22, 23, 24, 25, 26)
RIGHT_EAR = (27, 28, 29, 30, 31)
EAR = LEFT_EAR + RIGHT_EAR
MUZZLE = tuple(i for i in range(48) if i not in EYE and i not in EAR)

# Node identities from the hand-authored legend at the head of
# `models/graph_edge_schemes/graph_edges_manual_v2.txt` (v3's is identical). Each pair is
# (left, right) as that legend names them; 19 and 21 are named but are not a
# matched pair and are excluded.
BILATERAL_PAIRS = (
    (4, 8),  # eyelid outside
    (5, 9),  # eyelid inside
    (6, 10),  # eyelid top
    (7, 11),  # eyelid bottom
    (3, 1),  # pupil bottom
    (36, 41),  # pupil outside
    (37, 40),  # pupil inside
    (38, 39),  # pupil top
    (12, 13),  # nose top
    (14, 15),  # nostril middle
    (44, 45),  # nostril bottom
    (20, 18),  # mouth corner
    (33, 34),  # muzzle middle
    (46, 47),  # muzzle outside
    (32, 35),  # whisker pad outside
    (42, 43),  # whisker pad middle
    (22, 31),  # ear bottom-outside
    (23, 30),  # ear middle-outside
    (24, 29),  # ear top
    (25, 28),  # ear middle-inside
    (26, 27),  # ear bottom-inside
)
# Sagittal-plane points, same legend: nose philtrum, mouth top, mouth, chin.
MIDLINE_POINTS = (16, 17, 0, 2)
# The bilateral pair every yaw estimator measures against: the outer eye
# corners. Skeletally anchored, unlike the pupil points, and free of the ear
# position E1 measured PC1 tracking at r = 0.84.
OCULAR_PAIR = (4, 8)
PHILTRUM = 16
CHIN = 2

# FGS action-unit points, same legend. Eyes are (top, bottom, outside, inside);
# whisker and muzzle vectors run (middle, outside), left side first.
EAR_TIPS = (24, 29)
LEFT_EYELID = (6, 7, 4, 5)
RIGHT_EYELID = (10, 11, 8, 9)
LEFT_WHISKER, RIGHT_WHISKER = (42, 32), (43, 35)
LEFT_MUZZLE_SIDE, RIGHT_MUZZLE_SIDE = (33, 46), (34, 47)
# Closed ring around the muzzle: nose top, right side, chin, left side.
MUZZLE_OUTLINE = (12, 13, 35, 47, 19, 2, 21, 46, 32)
# Whether each AU's 0-2 score rises with its raw metric (see `score_au`).
AU_SCORE_RISES = {"ears": True, "orbital": False, "muzzle": False, "whiskers": True}


def letterbox_square(image: np.ndarray, size: int) -> tuple[np.ndarray, float, int, int]:
    """Resize preserving aspect ratio, pad to size x size. Returns
    (letterboxed_image, scale, pad_x, pad_y)."""
    h, w = image.shape[:2]
    scale = size / max(h, w)
    new_w, new_h = round(w * scale), round(h * scale)
    resized = cv2.resize(image, (new_w, new_h))
    pad_x, pad_y = (size - new_w) // 2, (size - new_h) // 2
    canvas = np.zeros((size, size, 3), dtype=image.dtype)
    canvas[pad_y : pad_y + new_h, pad_x : pad_x + new_w] = resized
    return canvas, scale, pad_x, pad_y


def unletterbox_xyxy(
    box_norm: BoxXYXY,
    size: int,
    scale: float,
    pad_x: int,
    pad_y: int,
    orig_w: int,
    orig_h: int,
) -> BoxXYXY:
    """Map a normalized xyxy box from a size x size letterboxed square back
    to original image pixel coordinates."""
    x1n, y1n, x2n, y2n = box_norm
    x1, y1 = (x1n * size - pad_x) / scale, (y1n * size - pad_y) / scale
    x2, y2 = (x2n * size - pad_x) / scale, (y2n * size - pad_y) / scale
    return (
        max(0.0, min(x1, orig_w)),
        max(0.0, min(y1, orig_h)),
        max(0.0, min(x2, orig_w)),
        max(0.0, min(y2, orig_h)),
    )


def expand_box(box_xyxy: BoxXYXY, margin: float, img_w: int, img_h: int) -> tuple[int, int, int, int]:
    """Grow a box by margin * (width, height) on each side, clipped to the image."""
    x1, y1, x2, y2 = box_xyxy
    pad_x, pad_y = margin * (x2 - x1), margin * (y2 - y1)
    return (
        max(0, round(x1 - pad_x)),
        max(0, round(y1 - pad_y)),
        min(img_w, round(x2 + pad_x)),
        min(img_h, round(y2 + pad_y)),
    )


def crop_and_resize(image: np.ndarray, box_xyxy: tuple[int, int, int, int], size: int) -> np.ndarray:
    """Crop to box and resize (stretch) to size x size."""
    x1, y1, x2, y2 = box_xyxy
    return cv2.resize(image[y1:y2, x1:x2], (size, size))


def map_points_to_image(points_norm: np.ndarray, box_xyxy: tuple[int, int, int, int]) -> np.ndarray:
    """Map (N,2) points normalized to a crop back to image pixel coordinates,
    using the same box passed to crop_and_resize."""
    x1, y1, x2, y2 = box_xyxy
    points = points_norm.astype(float).copy()
    points[:, 0] = points[:, 0] * (x2 - x1) + x1
    points[:, 1] = points[:, 1] * (y2 - y1) + y1
    return points


def _center_scale(shape: np.ndarray) -> np.ndarray:
    """Subtract the centroid, divide by Frobenius norm."""
    centered = shape - shape.mean(axis=0)
    return centered / np.linalg.norm(centered)


def procrustes_align(shape: np.ndarray, reference: np.ndarray) -> np.ndarray:
    """Rotate `shape` onto `reference`'s normalized frame (Kabsch/SVD),
    after independently centering and scaling both. Rotation-only:
    reflections are forbidden by flipping the sign of U's last column when
    the fitted rotation would otherwise have a negative determinant.

    This matters because landmarks here are labeled and anatomically
    chiral (left eye vs right eye are distinct indices, not an unordered
    point cloud — see LEFT_EYE/RIGHT_EYE in catface.ml.plausibility). An
    unconstrained Procrustes fit can silently pick a mirror-image solution
    that swaps left and right.
    """
    shape_n = _center_scale(shape)
    reference_n = _center_scale(reference)
    U, _, Vt = np.linalg.svd(shape_n.T @ reference_n)
    R = U @ Vt
    if np.linalg.det(R) < 0:
        U = U.copy()
        U[:, -1] *= -1
        R = U @ Vt
    return shape_n @ R


def generalized_procrustes(
    shapes: np.ndarray, tol: float = 1e-6, max_iter: int = 50
) -> tuple[np.ndarray, np.ndarray]:
    """Iterative Generalized Procrustes Analysis over `shapes` (M,48,2).

    Seeds the reference with the first (centered+scaled) shape, repeatedly
    aligns every shape to the current reference and recenters/rescales the
    mean of the aligned shapes into a new reference, until the reference
    stops moving (by `tol`) or `max_iter` is reached. Returns the shapes
    given one final alignment pass to the converged reference, plus that
    reference as the mean shape.
    """
    reference = _center_scale(shapes[0])
    for _ in range(max_iter):
        aligned = np.stack([procrustes_align(shape, reference) for shape in shapes])
        new_reference = _center_scale(aligned.mean(axis=0))
        converged = np.linalg.norm(new_reference - reference) < tol
        reference = new_reference
        if converged:
            break

    aligned = np.stack([procrustes_align(shape, reference) for shape in shapes])
    return aligned, reference


def _span(shapes: np.ndarray, a: int, b: int) -> np.ndarray:
    return np.linalg.norm(shapes[:, a] - shapes[:, b], axis=1)


def ear_spread_ratio(shapes: np.ndarray) -> np.ndarray:
    """(N,48,2) -> (N,). Ears: ear-tip span over outer-eye-corner span.
    Rises as the ears go from facing forward to pulled apart to rotated
    outward. Both are bilateral spans, so yaw scales both by |cos(theta)|
    (see `yaw_foreshortening_ratio`) and pitch leaves both alone; the
    skull-anchored denominator does not move with the ears."""
    return _span(shapes, *EAR_TIPS) / _span(shapes, *OCULAR_PAIR)


def eye_opening_ratio(shapes: np.ndarray) -> np.ndarray:
    """(N,48,2) -> (N,). Orbital tightening: eyelid top-bottom distance over
    outside-inside corner distance, averaged over both eyes. Falls as the eyes
    go from open to partly closed to squinted. Pupil points are left out:
    dilation is not tightening. Confound: yaw shrinks the corner span and
    inflates the ratio by 1/|cos(theta)|."""
    ratios = [
        _span(shapes, top, bottom) / _span(shapes, outside, inside)
        for top, bottom, outside, inside in (LEFT_EYELID, RIGHT_EYELID)
    ]
    return (ratios[0] + ratios[1]) / 2


def muzzle_roundness(shapes: np.ndarray) -> np.ndarray:
    """(N,48,2) -> (N,). Muzzle tension: minor/major axis ratio of the
    second-moment ellipse of `MUZZLE_OUTLINE`, sqrt(lambda_min/lambda_max) of
    the points' covariance. 1 is round; falls as the muzzle goes elliptic.
    Moments rather than `cv2.fitEllipse` keep the TypeScript port short.
    Confound: pitch squashes it vertically, yaw horizontally."""
    points = shapes[:, list(MUZZLE_OUTLINE)]
    centered = points - points.mean(axis=1, keepdims=True)
    eigvals = np.linalg.eigvalsh(np.einsum("nki,nkj->nij", centered, centered))
    return np.sqrt(eigvals[:, 0] / eigvals[:, 1])


def _signed_angle(shapes: np.ndarray, base: tuple[int, int], vec: tuple[int, int]) -> np.ndarray:
    """Degrees from the base vector to `vec`, each (from, to) indices;
    positive is clockwise on screen (image y points down)."""
    b = shapes[:, base[1]] - shapes[:, base[0]]
    v = shapes[:, vec[1]] - shapes[:, vec[0]]
    cross = b[:, 0] * v[:, 1] - b[:, 1] * v[:, 0]
    return np.degrees(np.arctan2(cross, (b * v).sum(axis=1)))


def whisker_elevation(shapes: np.ndarray) -> np.ndarray:
    """(N,48,2) -> (N,). Whisker change: angle in degrees from the muzzle
    side (middle->outside) to the whisker pad (middle->outside), mirrored so
    that a pad tilted upward from the muzzle is positive on both sides, then
    averaged. Rises as the whiskers go from pointing down, to level with the
    muzzle, to pointing up. A relative angle, so head roll cancels. Level is
    not pinned to 0 degrees: where score 1 sits is the cutoffs' job."""
    left = _signed_angle(shapes, LEFT_MUZZLE_SIDE, LEFT_WHISKER)
    right = _signed_angle(shapes, RIGHT_MUZZLE_SIDE, RIGHT_WHISKER)
    return (left - right) / 2


def score_au(value: np.ndarray, cutoffs: Sequence[float], rises: bool = True) -> np.ndarray:
    """0-2 score from a raw AU metric and ascending cutoffs (c1, c2) in the
    metric's units. `rises` comes from `AU_SCORE_RISES`: True scores 1 above
    c1 and 2 above c2; False scores 1 below c2 and 2 below c1. A value equal
    to a cutoff stays in the lower score."""
    if rises:
        return np.searchsorted(cutoffs, value, side="left")
    return len(cutoffs) - np.searchsorted(cutoffs, value, side="right")


def _ocular_frame(
    shapes: np.ndarray, pair: tuple[int, int]
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Per-row in-plane frame built on a bilateral pair: (span, u_hat, n_hat,
    midpoint), each (N,) or (N,2). `u_hat` runs from pair[0] to pair[1]."""
    left, right = shapes[:, pair[0]], shapes[:, pair[1]]
    axis = right - left
    span = np.linalg.norm(axis, axis=1)
    u_hat = axis / span[:, None]
    n_hat = np.stack([-u_hat[:, 1], u_hat[:, 0]], axis=1)
    return span, u_hat, n_hat, (left + right) / 2


def yaw_foreshortening_ratio(
    shapes: np.ndarray, pair: tuple[int, int] = OCULAR_PAIR, vertical_index: int = CHIN
) -> np.ndarray:
    """(N,48,2) -> (N,). Family 1 of RSCH-4's second grooming pass: the
    observed bilateral span over a yaw-invariant vertical span.

    A bilateral pair at `(+/-a, y0, z0)` projects to `u = +/-a*cos(theta) +
    z0*sin(theta)`, so the observed span is `w*|cos(theta)|` and the pair's
    own depth cancels. A vertical span is untouched by rotation about the
    vertical axis. So `w_obs / v_obs = r_frontal * |cos(theta)|`, with no
    depth prior anywhere. Unsigned: `cos` is even. Use
    `yaw_midline_offset` for the sign.

    This is the rotation-invariant form of the issue's `w_obs = |u_4 - u_8|`
    and `v_obs = |v_2 - (v_4 + v_8)/2|`: those read raw coordinate
    differences and so assume each row's eye-corner axis is exactly
    horizontal, which `generalized_procrustes` does not give -- it rotates
    each shape to best-fit the *mean*, leaving the ocular axis only
    approximately horizontal. Projecting onto the pair's own axis and its
    normal measures the same two quantities in the shape's own frame,
    the idiom `ear_angle` already uses.
    """
    span, _u_hat, n_hat, midpoint = _ocular_frame(shapes, pair)
    vertical = np.abs(((shapes[:, vertical_index] - midpoint) * n_hat).sum(axis=1))
    return span / vertical


def yaw_midline_offset(
    shapes: np.ndarray, midline_index: int = PHILTRUM, pair: tuple[int, int] = OCULAR_PAIR
) -> np.ndarray:
    """(N,48,2) -> (N,). Family 2: the signed offset of a sagittal point from
    the bilateral pair's midpoint, in units of the pair's observed span.

    For a midline point `M` at `(0, y_M, z_M)` and a pair at depth `z0`, the
    numerator is `(z_M - z0)*sin(theta)` and the denominator `w*cos(theta)`,
    so `s = d_rel * tan(theta)` with `d_rel = (z_M - z0)/w`: signed,
    monotonic, no saturation and no second root. Positive `s` means the
    midline point sits toward pair[1] relative to the pair's midpoint.

    Rotation-invariant form of the issue's `s = (u_M - (u_L + u_R)/2) /
    (u_R - u_L)`, for the same reason as `yaw_foreshortening_ratio`: the
    projection is onto the pair's own axis rather than onto an assumed
    horizontal.
    """
    span, u_hat, _n_hat, midpoint = _ocular_frame(shapes, pair)
    return ((shapes[:, midline_index] - midpoint) * u_hat).sum(axis=1) / span


def yaw_centroid_proxy(shapes: np.ndarray) -> np.ndarray:
    """(N,48,2) -> (N,). E1's head-yaw confound proxy, kept as a named legacy
    quantity: muzzle-centroid distance to the right eye centroid minus the
    same to the left. Superseded as a yaw estimator by the two functions
    above (RSCH-4 second grooming pass) -- it goes as `sin(2*theta)`, so it
    turns over -- but E1's PC2 correlation of r = 0.90 is stated against
    this array, so the summation order is the one `scripts/shape_space.py`
    published and must not be rearranged."""
    muzzle_centroid = shapes[:, list(MUZZLE), :].mean(axis=1)
    left_eye_centroid = shapes[:, list(LEFT_EYE), :].mean(axis=1)
    right_eye_centroid = shapes[:, list(RIGHT_EYE), :].mean(axis=1)
    dist_right = np.linalg.norm(muzzle_centroid - right_eye_centroid, axis=1)
    dist_left = np.linalg.norm(muzzle_centroid - left_eye_centroid, axis=1)
    return dist_right - dist_left
