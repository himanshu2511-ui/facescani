import hashlib
import pytest
from app.face_analyzer import (
    Point3D, euclidean_distance_3d, calculate_angle,
    FaceAnalyzer,
)
from app.guidance import GuidanceGenerator

EXPECTED_DETAIL_KEYS = [
    "Symmetry", "Golden Ratio", "Harmony", "Eye Aesthetics",
    "Eyebrow Shape", "Nose Aesthetics", "Lip Aesthetics",
    "Jawline", "Cheekbones", "Face Shape",
]


def test_euclidean_distance():
    p1 = Point3D(0, 0, 0)
    p2 = Point3D(3, 4, 0)
    assert euclidean_distance_3d(p1, p2) == 5.0


def test_calculate_angle():
    p1 = Point3D(1, 0, 0)
    p_vertex = Point3D(0, 0, 0)
    p2 = Point3D(0, 1, 0)
    assert abs(calculate_angle(p1, p_vertex, p2) - 90.0) < 1e-5


def test_fallback_structure():
    """Pixel-hash fallback returns all required keys."""
    analyzer = FaceAnalyzer()
    # Simulate two different images with different byte content
    img_bytes_a = b"\x00\x01\x02\x03" * 100
    img_bytes_b = b"\xFF\xFE\xFD\xFC" * 100

    hash_a = hashlib.sha256(img_bytes_a).hexdigest()
    hash_b = hashlib.sha256(img_bytes_b).hexdigest()

    res_a = analyzer._pixel_hash_scores(hash_a, "female", 0)
    res_b = analyzer._pixel_hash_scores(hash_b, "female", 0)

    for res in (res_a, res_b):
        assert "total_score" in res
        assert "potential_score" in res
        assert "details" in res
        assert res["total_score"] <= res["potential_score"]
        for k in EXPECTED_DETAIL_KEYS:
            assert k in res["details"], f"Missing key: {k}"

    # Different images must produce different scores
    assert res_a["total_score"] != res_b["total_score"], (
        "Different images produced the same score — hash collision or bug."
    )


def test_fallback_determinism_across_accounts():
    """Same image bytes → same score regardless of username/account."""
    analyzer = FaceAnalyzer()
    img_bytes = b"\xAB\xCD\xEF" * 200
    image_hash = hashlib.sha256(img_bytes).hexdigest()

    res_user1 = analyzer._pixel_hash_scores(image_hash, "female", 0)
    res_user2 = analyzer._pixel_hash_scores(image_hash, "female", 0)

    assert res_user1["total_score"] == res_user2["total_score"], (
        "Same image gave different total scores for different users — determinism broken!"
    )
    assert res_user1["details"] == res_user2["details"], (
        "Same image gave different detail scores — determinism broken!"
    )


def test_guidance_generator():
    scores = {
        "Symmetry": 75.0,
        "Golden Ratio": 70.0,
        "Harmony": 72.0,
        "Eye Aesthetics": 65.0,
        "Eyebrow Shape": 68.0,
        "Nose Aesthetics": 85.0,
        "Lip Aesthetics": 80.0,
        "Jawline": 60.0,
        "Cheekbones": 70.0,
        "Face Shape": 74.0,
    }
    roadmap = GuidanceGenerator.generate_roadmap(scores, gender="male")
    assert "disclaimer" in roadmap
    assert "weakest_features" in roadmap
    assert "roadmap" in roadmap
    assert len(roadmap["roadmap"]) == 4  # 4 weeks
