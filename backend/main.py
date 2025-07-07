from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import google.generativeai as genai
import os
from dotenv import load_dotenv
import asyncio

load_dotenv()

app = FastAPI()

# Configuration du CORS pour autoriser les requêtes du frontend
origins = [
    "http://localhost",
    "http://localhost:5173", # Port par défaut de Vite/React
    "http://localhost:5174", # Port de repli que Vite utilise souvent
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

async def stream_generator(model, message_text):
    """
    Générateur asynchrone qui produit les morceaux de la réponse de l'IA.
    """
    try:
        # On active le streaming dans l'appel à l'API
        stream = await model.generate_content_async(message_text, stream=True)
        async for chunk in stream:
            if chunk.text:
                yield chunk.text
                await asyncio.sleep(0.01) # Petite pause pour permettre l'envoi
    except Exception as e:
        print(f"Erreur pendant le streaming : {e}")
        yield f"Erreur de communication avec le modèle d'IA : {e}"

@app.post("/api/chat")
async def chat(message: Message):
    """
    Endpoint de chat qui utilise maintenant une StreamingResponse.
    """
    try:
        model_name = os.getenv("GEMINI_MODEL_NAME", "gemini-pro")
        model = genai.GenerativeModel(model_name)
        
        # On retourne une StreamingResponse qui utilise notre générateur
        return StreamingResponse(
            stream_generator(model, message.text),
            media_type="text/plain"
        )
    except Exception as e:
        print(f"Une erreur est survenue dans l'endpoint chat : {e}")
        # Cette partie est plus difficile à atteindre maintenant que la logique est dans le générateur
        return {"error": f"Erreur lors de l'initialisation du chat : {e}"} 