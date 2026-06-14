import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_register_and_login():
    # Attempt to register a test user
    # Use a unique username to avoid conflicts
    import random
    rand_id = random.randint(1000, 9999)
    username = f"testuser_{rand_id}"
    password = "testpassword123"
    
    # 1. Test successful registration
    response = client.post(
        "/auth/register",
        json={
            "username": username,
            "password": password,
            "gender": "male"
        }
    )
    assert response.status_code == 200, f"Register failed: {response.text}"
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    
    # 2. Test duplicate registration (should return 400)
    response = client.post(
        "/auth/register",
        json={
            "username": username,
            "password": password,
            "gender": "female"
        }
    )
    assert response.status_code == 400, "Should fail on duplicate username"
    
    # 3. Test validation error (invalid gender)
    response = client.post(
        "/auth/register",
        json={
            "username": f"other_{rand_id}",
            "password": password,
            "gender": "invalid_gender"
        }
    )
    assert response.status_code == 422, "Should return 422 on invalid gender"

    # 4. Test login with correct credentials
    response = client.post(
        "/auth/login",
        data={
            "username": username,
            "password": password
        }
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    login_data = response.json()
    assert "access_token" in login_data
    
    # 5. Test login with incorrect password
    response = client.post(
        "/auth/login",
        data={
            "username": username,
            "password": "wrongpassword"
        }
    )
    assert response.status_code == 401
