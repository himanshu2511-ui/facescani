import pytest
from app.face_analyzer import Point3D, euclidean_distance_3d, calculate_angle, FaceAnalyzer
from app.guidance import GuidanceGenerator

def test_euclidean_distance():
    p1 = Point3D(0, 0, 0)
    p2 = Point3D(3, 4, 0)
    assert euclidean_distance_3d(p1, p2) == 5.0

def test_calculate_angle():
    p1 = Point3D(1, 0, 0)
    p_vertex = Point3D(0, 0, 0)
    p2 = Point3D(0, 1, 0)
    # 90 degrees
    assert abs(calculate_angle(p1, p_vertex, p2) - 90.0) < 1e-5

def test_face_analyzer_fallback():
    analyzer = FaceAnalyzer()
    res = analyzer._generate_simulated_scores(gender="female")
    assert "total_score" in res
    assert "potential_score" in res
    assert "details" in res
    assert res["total_score"] < res["potential_score"]
    
    # Check details keys
    new_keys = [
        "Symmetry", "Golden Ratio", "Harmony", "Eye Aesthetics", 
        "Eyebrow Shape", "Nose Aesthetics", "Lip Aesthetics", 
        "Jawline", "Cheekbones", "Face Shape"
    ]
    for k in new_keys:
        assert k in res["details"]

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
        "Face Shape": 74.0
    }
    roadmap = GuidanceGenerator.generate_roadmap(scores, gender="male")
    assert "disclaimer" in roadmap
    assert "weakest_features" in roadmap
    assert "roadmap" in roadmap
    assert len(roadmap["roadmap"]) == 4  # 4 weeks
