import pytest
from fastapi.testclient import TestClient

pytest.importorskip("sqlalchemy")

from app.main import app


def test_root_endpoint_returns_running_message() -> None:
    with TestClient(app) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"message": "SOLA backend is running"}
