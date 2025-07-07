from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import google.generativeai as genai
import os
from dotenv import load_dotenv
import asyncio
from google.generativeai.types import GenerationConfig, Tool, FunctionDeclaration

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

class ChatRequest(BaseModel):
    text: str
    history: list = []

# Définition de notre outil personnalisé pour la cascade de génération
lancer_cascade_generation_tool = Tool(
    function_declarations=[
        FunctionDeclaration(
            name="lancer_cascade_generation",
            description="À n'utiliser que lorsque l'utilisateur a fourni toutes les informations nécessaires et confirme explicitement vouloir générer le document final."
        )
    ]
)

# Le "Master Prompt" qui guide l'IA
MASTER_PROMPT = """
Tu es "CounselAI", un assistant expert en droit des affaires spécialisé dans la rédaction de contrats.
Ton objectif est d'aider les avocats à rédiger des documents juridiques complexes en suivant une méthodologie précise.
Tu ne dois JAMAIS saluer l'utilisateur, mais répondre directement à sa requête, car un message d'accueil est déjà présent dans l'interface.

Voici ton workflow :
1.  **Dialogue et collecte :** Ton but est de collecter toutes les informations et les clauses clés nécessaires pour rédiger un document. Pose des questions précises pour clarifier chaque point en dialoguant avec l'utilisateur.
2.  **Attente de confirmation :** Une fois que tu estimes avoir toutes les informations, demande à l'utilisateur une confirmation claire, comme "Pouvons-nous lancer la génération du document ?".
3.  **Appel de l'outil :** Uniquement après avoir reçu cette confirmation explicite, tu DOIS appeler l'outil `lancer_cascade_generation`. N'écris rien d'autre dans ta réponse.

Ne dévie jamais de ce workflow.
"""

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
async def chat(request: ChatRequest):
    """
    Endpoint de chat qui gère la logique du Master Prompt, des outils, et de l'historique.
    """
    try:
        model = genai.GenerativeModel(
            model_name=os.getenv("GEMINI_MODEL_NAME", "gemini-pro"),
            system_instruction=MASTER_PROMPT,
            tools=[lancer_cascade_generation_tool]
        )
        
        chat_session = model.start_chat(history=request.history)
        response = await chat_session.send_message_async(request.text, stream=True)

        async def stream_response_handler():
            # On doit inspecter le premier chunk pour voir si c'est un tool call
            try:
                first_chunk = await response.__aiter__().__anext__()
            except StopAsyncIteration:
                 # Le stream est vide, ce qui peut arriver. On ne renvoie rien.
                return

            # Cas 1 : L'IA demande à utiliser un outil
            if hasattr(first_chunk, 'function_calls') and first_chunk.function_calls:
                tool_name = first_chunk.function_calls[0].name
                print(f"Détection d'un appel à l'outil : {tool_name}")
                yield f"TOOL_CALL:{tool_name}"
                return # On arrête ici pour les tool calls

            # Cas 2 : L'IA répond avec du texte
            # Renvoyer le premier chunk qu'on a déjà consommé
            if first_chunk.text:
                yield first_chunk.text
            
            # Continuer avec le reste du stream
            async for chunk in response:
                if chunk.text:
                    yield chunk.text
                    await asyncio.sleep(0.01)

        return StreamingResponse(stream_response_handler(), media_type="text/plain")

    except Exception as e:
        print(f"Une erreur est survenue dans l'endpoint chat : {e}")
        async def error_generator(exc: Exception):
            yield f"Erreur critique inattendue: {exc}"
        return StreamingResponse(error_generator(e), media_type="text/plain") 