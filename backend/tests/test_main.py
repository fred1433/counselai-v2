import pytest
import httpx
from fastapi.testclient import TestClient
from backend.main import app

# Crée un client de test pour notre application FastAPI
client = TestClient(app)

def test_read_root():
    """Teste que l'endpoint racine '/' fonctionne."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "backend is running"}

def test_chat_streaming_endpoint():
    """Teste l'endpoint de chat et vérifie qu'il renvoie bien du contenu."""
    payload = {"text": "Bonjour, ceci est un test."}
    response = client.post("/api/chat", json=payload)
    # 1. Statut OK
    assert response.status_code == 200
    # 2. Corps non vide
    assert response.text != "" 