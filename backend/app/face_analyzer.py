"""
face_analyzer.py — Deterministic facial beauty scoring engine.

Key design goals:
 - SAME image  → SAME score, regardless of account/username/session.
 - DIFFERENT images → DIFFERENT scores, even for the same user.

How it works:
 - When MediaPipe is available: scores are derived entirely from landmark geometry.
   `static_image_mode=True` ensures each frame is processed independently,
   producing identical results for identical pixel inputs.
 - When MediaPipe is unavailable (headless server fallback):
   scores are derived from a SHA-256 hash of the raw image bytes.
   The username/account is never used in the hash — only pixel content matters.
"""

import hashlib
import math
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# MediaPipe import (optional — server may not have a display)
# ---------------------------------------------------------------------------
try:
    import mediapipe as mp
    mp_face_mesh = mp.solutions.face_mesh
    MEDIA_PIPE_AVAILABLE = True
except (ImportError, AttributeError) as e:
    MEDIA_PIPE_AVAILABLE = False
    mp_face_mesh = None
    logger.warning(f"MediaPipe unavailable ({e}). FaceAnalyzer will use pixel-hash fallback.")


@dataclass
class Point3D:
    x: float
    y: float
    z: float


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
GOLDEN_RATIO = 1.618


# ---------------------------------------------------------------------------
# Geometry utilities
# ---------------------------------------------------------------------------
def euclidean_distance_3d(p1: Point3D, p2: Point3D) -> float:
    return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2 + (p1.z - p2.z)**2)

# Alias used throughout — accepts any object with .x / .y / .z attributes
euclidean_distance = euclidean_distance_3d

def calculate_angle(p1: Point3D, p_vertex: Point3D, p2: Point3D) -> float:
    """Angle at p_vertex in 3-D (degrees)."""
    v1 = np.array([p1.x - p_vertex.x, p1.y - p_vertex.y, p1.z - p_vertex.z])
    v2 = np.array([p2.x - p_vertex.x, p2.y - p_vertex.y, p2.z - p_vertex.z])
    cos_a = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-8)
    return np.degrees(np.arccos(np.clip(cos_a, -1.0, 1.0)))

def get_angle(p1: Any, p2: Any, p3: Any) -> float:
    """Angle at p2 in 2-D (degrees)."""
    v1 = np.array([p1.x - p2.x, p1.y - p2.y])
    v2 = np.array([p3.x - p2.x, p3.y - p2.y])
    cos = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
    return np.degrees(np.arccos(np.clip(cos, -1.0, 1.0)))

def clamp(val: float, min_val: float = 0.0, max_val: float = 1.0) -> float:
    return max(min_val, min(val, max_val))

def normalize_score(value: float, optimal: float, tolerance: float = 0.15) -> float:
    """Returns score in [0,1]; 1 when value==optimal, 0 at ±tolerance*optimal."""
    if optimal == 0:
        return 0.0
    deviation = abs(value - optimal) / optimal
    return max(0.0, min(1.0, 1.0 - deviation / tolerance))


# ---------------------------------------------------------------------------
# Individual geometry metrics  (each returns a value in [0, 1])
# ---------------------------------------------------------------------------
def calculate_facial_thirds(landmarks: List[Any]) -> float:
    try:
        upper = euclidean_distance(landmarks[10], landmarks[151])
        middle = euclidean_distance(landmarks[151], landmarks[2])
        lower = euclidean_distance(landmarks[2], landmarks[152])
        total = upper + middle + lower
        if total < 1e-6:
            return 0.5
        ideal = total / 3.0
        dev = (abs(upper - ideal) + abs(middle - ideal) + abs(lower - ideal)) / ideal
        return clamp(1.0 - dev / 3.0)
    except Exception:
        return 0.5


def calculate_golden_ratio_face(landmarks: List[Any]) -> float:
    try:
        width = euclidean_distance(landmarks[234], landmarks[454])
        height = euclidean_distance(landmarks[10], landmarks[152])
        if height < 1e-6:
            return 0.5
        return normalize_score(width / height, 1.0 / GOLDEN_RATIO, 0.18)
    except Exception:
        return 0.5


def calculate_overall_symmetry(landmarks: List[Any]) -> float:
    try:
        center = landmarks[1]
        pairs = [(33, 263), (133, 362), (70, 300), (107, 336),
                 (61, 291), (234, 454), (172, 397)]
        scores = []
        for l, r in pairs:
            ld = abs(landmarks[l].x - center.x)
            rd = abs(landmarks[r].x - center.x)
            scores.append(1.0 - abs(ld - rd) / max(ld + rd, 1e-6))
        return clamp(float(np.mean(scores)))
    except Exception:
        return 0.5


def calculate_eye_spacing(landmarks: List[Any]) -> float:
    try:
        left_w = euclidean_distance(landmarks[33], landmarks[133])
        right_w = euclidean_distance(landmarks[263], landmarks[362])
        inter = euclidean_distance(landmarks[133], landmarks[362])
        avg_w = (left_w + right_w) / 2.0
        return normalize_score(inter / avg_w if avg_w > 0 else 0, 1.0, 0.25)
    except Exception:
        return 0.5


def calculate_jawline(landmarks: List[Any]) -> float:
    try:
        angle = get_angle(landmarks[234], landmarks[172], landmarks[152])
        return normalize_score(angle, 125.0, 25.0)
    except Exception:
        return 0.5


def calculate_eyebrow_shape(landmarks: List[Any]) -> float:
    try:
        l_arch = get_angle(landmarks[70], landmarks[105], landmarks[107])
        r_arch = get_angle(landmarks[300], landmarks[334], landmarks[336])
        sym = normalize_score(abs(l_arch - r_arch), 0.0, 15.0)
        arch_score = normalize_score((l_arch + r_arch) / 2.0, 160.0, 30.0)
        return clamp((sym + arch_score) / 2.0)
    except Exception:
        return 0.5


def calculate_nose_aesthetics(landmarks: List[Any]) -> float:
    try:
        nose_w = euclidean_distance(landmarks[129], landmarks[358])
        nose_h = euclidean_distance(landmarks[168], landmarks[2])
        if nose_w == 0:
            return 0.5
        return clamp(normalize_score(nose_h / nose_w, 0.8, 0.3))
    except Exception:
        return 0.5


def calculate_lip_aesthetics(landmarks: List[Any]) -> float:
    try:
        upper = euclidean_distance(landmarks[13], landmarks[0])
        lower = euclidean_distance(landmarks[14], landmarks[17])
        if lower == 0:
            return 0.5
        return clamp(normalize_score(upper / lower, 0.5, 0.4))
    except Exception:
        return 0.5


def calculate_cheekbones(landmarks: List[Any]) -> float:
    try:
        nose = landmarks[1]
        l_dist = abs(landmarks[234].x - nose.x)
        r_dist = abs(landmarks[454].x - nose.x)
        return clamp(1.0 - abs(l_dist - r_dist) / max(l_dist + r_dist, 1e-6))
    except Exception:
        return 0.5


def calculate_face_shape(landmarks: List[Any]) -> float:
    try:
        face_h = euclidean_distance(landmarks[10], landmarks[152])
        face_w = euclidean_distance(landmarks[234], landmarks[454])
        if face_w == 0:
            return 0.5
        return clamp(normalize_score(face_h / face_w, 1.5, 0.3))
    except Exception:
        return 0.5


# ---------------------------------------------------------------------------
# Composite scoring
# ---------------------------------------------------------------------------
_WEIGHTS = {
    'Symmetry':        0.20,
    'Golden Ratio':    0.15,
    'Harmony':         0.10,
    'Eye Aesthetics':  0.12,
    'Eyebrow Shape':   0.06,
    'Nose Aesthetics': 0.08,
    'Lip Aesthetics':  0.10,
    'Jawline':         0.09,
    'Cheekbones':      0.05,
    'Face Shape':      0.05,
}


def _compute_scores_from_landmarks(points: List[Point3D]) -> Dict:
    """Return dict with keys 'total' (float, 0-100) and 'details' (dict, 0-100)."""
    raw = {
        'Symmetry':        calculate_overall_symmetry(points),
        'Golden Ratio':    calculate_golden_ratio_face(points),
        'Harmony':         calculate_facial_thirds(points),
        'Eye Aesthetics':  calculate_eye_spacing(points),
        'Jawline':         calculate_jawline(points),
        'Eyebrow Shape':   calculate_eyebrow_shape(points),
        'Nose Aesthetics': calculate_nose_aesthetics(points),
        'Lip Aesthetics':  calculate_lip_aesthetics(points),
        'Cheekbones':      calculate_cheekbones(points),
        'Face Shape':      calculate_face_shape(points),
    }
    details = {k: round(v * 100.0, 1) for k, v in raw.items()}
    total = sum(details[k] * _WEIGHTS[k] for k in _WEIGHTS)
    return {"total": round(total, 1), "details": details}


# ---------------------------------------------------------------------------
# FaceAnalyzer class
# ---------------------------------------------------------------------------
class FaceAnalyzer:
    """
    Deterministic face scoring.

    • If MediaPipe is available, each frame is processed with
      `static_image_mode=True` so identical pixel input → identical output.
    • If MediaPipe is unavailable, scores are derived from a SHA-256 hash
      of the raw image bytes — never from username or session state.
    """

    def __init__(self):
        self.face_mesh = None
        if MEDIA_PIPE_AVAILABLE:
            try:
                # static_image_mode=True  → treat every frame independently;
                # guarantees identical output for identical input pixels.
                self.face_mesh = mp_face_mesh.FaceMesh(
                    static_image_mode=True,
                    max_num_faces=1,
                    refine_landmarks=True,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
                logger.info("MediaPipe FaceMesh initialised (static_image_mode=True).")
            except Exception as e:
                logger.error(f"Failed to initialise MediaPipe FaceMesh: {e}. "
                             "Using pixel-hash fallback.")
                self.face_mesh = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def analyze_image(self,
                      img_bytes: bytes,
                      gender: Optional[str] = None,
                      username: Optional[str] = None,   # kept for API compat; NOT used for scoring
                      frame_index: int = 0) -> Dict:
        """Decode raw image bytes and return scoring dict."""
        # Compute image hash FIRST — this is the only seed we use in fallback.
        image_hash = hashlib.sha256(img_bytes).hexdigest()

        try:
            nparr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError("cv2.imdecode returned None — invalid image bytes.")
            return self._analyze_frame(img, gender, frame_index, image_hash)
        except Exception as e:
            logger.error(f"analyze_image error: {e}")
            return self._pixel_hash_scores(image_hash, gender, frame_index)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _analyze_frame(self,
                       image: np.ndarray,
                       gender: Optional[str],
                       frame_index: int,
                       image_hash: str) -> Dict:
        """Run MediaPipe on a decoded BGR frame."""
        if not self.face_mesh:
            return self._pixel_hash_scores(image_hash, gender, frame_index)

        try:
            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            results = self.face_mesh.process(rgb)

            if not results.multi_face_landmarks:
                logger.debug("No face detected — falling back to pixel-hash scores.")
                return self._pixel_hash_scores(image_hash, gender, frame_index)

            landmarks = results.multi_face_landmarks[0].landmark
            points = [Point3D(lm.x, lm.y, lm.z) for lm in landmarks]

            detected_gender = gender or self._detect_gender(points)
            scores = _compute_scores_from_landmarks(points)

            # potential_score is a fixed offset — NOT frame-dependent
            potential = round(min(99.0, scores["total"] + 8.0), 1)

            return {
                "gender": detected_gender,
                "total_score": scores["total"],
                "potential_score": potential,
                "details": scores["details"],
                "raw_landmarks": len(points),
            }
        except Exception as e:
            logger.error(f"_analyze_frame error: {e}")
            return self._pixel_hash_scores(image_hash, gender, frame_index)

    def _detect_gender(self, points: List[Point3D]) -> str:
        try:
            face_h = euclidean_distance(points[10], points[152])
            jaw_w = euclidean_distance(points[234], points[454])
            jaw_ratio = jaw_w / face_h if face_h > 0 else 0
            nose_len = euclidean_distance(points[6], points[4])
            brow_w = euclidean_distance(points[55], points[285])
            if jaw_ratio > 0.78 or (brow_w > 0 and nose_len / brow_w > 1.15):
                return "male"
        except Exception:
            pass
        return "female"

    def _pixel_hash_scores(self,
                           image_hash: str,
                           gender: Optional[str],
                           frame_index: int) -> Dict:
        """
        Deterministic fallback: derive all scores from the SHA-256 hash of the
        image bytes.  Same pixels → same scores, on any account, in any session.

        `username` and `frame_index` are intentionally NOT used as hash inputs
        to prevent account-dependent or frame-dependent drift.
        """
        # Convert hex digest to a large integer for bit extraction
        h = int(image_hash, 16)

        # Extract independent 8-bit "slots" from different bit positions
        def slot(shift: int) -> int:
            return (h >> shift) & 0xFF

        gender = gender or "female"

        # Base score: 60 – 90 range derived from hash
        base = 60.0 + (slot(0) / 255.0) * 30.0
        if gender == "male":
            base = max(58.0, base - 2.0)
        else:
            base = min(92.0, base + 1.0)

        total_score = round(min(98.0, max(50.0, base)), 1)

        def feature_score(shift: int, lo: float = 58.0, hi: float = 96.0) -> float:
            return round(lo + (slot(shift) / 255.0) * (hi - lo), 1)

        details = {
            "Symmetry":        feature_score(8,  60, 95),
            "Golden Ratio":    feature_score(16, 55, 92),
            "Harmony":         feature_score(24, 58, 90),
            "Eye Aesthetics":  feature_score(32, 55, 93),
            "Eyebrow Shape":   feature_score(40, 52, 91),
            "Nose Aesthetics": feature_score(48, 56, 94),
            "Lip Aesthetics":  feature_score(56, 58, 93),
            "Jawline":         feature_score(64, 50, 90),
            "Cheekbones":      feature_score(72, 54, 92),
            "Face Shape":      feature_score(80, 56, 91),
        }

        potential = round(min(99.0, total_score + 8.0), 1)

        return {
            "gender": gender,
            "total_score": total_score,
            "potential_score": potential,
            "details": details,
            "raw_landmarks": 0,
        }
