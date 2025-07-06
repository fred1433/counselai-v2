from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Configuration du CORS pour autoriser les requêtes du frontend
origins = [
    "http://localhost",
    "http://localhost:5173", # Port par défaut de Vite/React
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration de l'API Gemini avec les variables d'environnement
try:
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    if not GEMINI_API_KEY:
        raise ValueError("La clé d'API Gemini (GEMINI_API_KEY) n'est pas définie dans le fichier .env")
    genai.configure(api_key=GEMINI_API_KEY)
except Exception as e:
    print(f"Erreur lors de la configuration de l'API Gemini : {e}")

class Message(BaseModel):
    text: str

@app.get("/")
def read_root():
    return {"status": "backend is running"}

@app.post("/api/chat")
async def chat(message: Message):
    """
    Endpoint principal pour le chat.
    Reçoit un message de l'utilisateur, l'envoie à Gemini et retourne la réponse.
    """
    try:
        model_name = os.getenv("GEMINI_MODEL_NAME", "gemini-pro")
        model = genai.GenerativeModel(model_name)
        
        # Utilisation de la version asynchrone pour de meilleures performances avec FastAPI
        llm_response = await model.generate_content_async(message.text)
        
        return {"response": llm_response.text}
    except Exception as e:
        print(f"Une erreur est survenue lors de l'appel à l'API Gemini : {e}")
        return {"error": f"Erreur de communication avec le modèle d'IA : {e}"} 