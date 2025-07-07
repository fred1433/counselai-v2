from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import google.generativeai as genai
import os
from dotenv import load_dotenv
import asyncio
from google.generativeai.types import GenerationConfig, Tool, FunctionDeclaration
from fastapi import HTTPException

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

class GenerateLawyerResponseRequest(BaseModel):
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

LAWYER_SIMULATOR_PROMPT = """
**Votre Rôle :**
Vous êtes un avocat d'affaires expérimenté qui dialogue avec votre assistant IA (CounselAI).
Votre assistant vous pose des questions pour rassembler toutes les informations nécessaires à la rédaction d'un contrat.

**Votre Mission :**
Répondez **directement** à la **dernière question** de l'assistant.
Fournissez des informations concrètes, plausibles et concises.
N'ajoutez aucune salutation ou phrase superflue. Ne posez JAMAIS de questions en retour.

**Exemple :**
Si l'assistant demande : "Quel est le nom de la société cliente ?"
Votre réponse doit être : "La société s'appelle Innovatech SAS."
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

@app.post("/api/generate_lawyer_response")
async def generate_lawyer_response(request: GenerateLawyerResponseRequest):
    """
    Génère une réponse d'avocat simulée basée sur l'historique de la conversation.
    """
    try:
        # Utilise un modèle dédié avec le prompt du simulateur d'avocat
        lawyer_model = genai.GenerativeModel(
            model_name=os.getenv("GEMINI_MODEL_NAME", "gemini-pro"),
            system_instruction=LAWYER_SIMULATOR_PROMPT
        )
        
        chat_session = lawyer_model.start_chat(history=request.history)
        # On ne streame pas, on veut la réponse complète directement
        response = await chat_session.send_message_async("Répondez à la dernière question de l'assistant en vous basant sur l'historique.")
        
        return {"response": response.text}

    except Exception as e:
        print(f"Erreur lors de la génération de la réponse de l'avocat : {e}")
        raise HTTPException(status_code=500, detail="Erreur interne du serveur")

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """
    Endpoint de chat qui gère la logique du Master Prompt, des outils, et de l'historique.
    """
    async def stream_response_generator():
        try:
            model = genai.GenerativeModel(
                model_name=os.getenv("GEMINI_MODEL_NAME", "gemini-pro"),
                system_instruction=MASTER_PROMPT,
                tools=[lancer_cascade_generation_tool]
            )
            
            chat_session = model.start_chat(history=request.history)
            response = await chat_session.send_message_async(request.text, stream=True)

            # Boucle de streaming unique et propre pour corriger le bug de répétition.
            async for chunk in response:
                if hasattr(chunk, 'function_calls') and chunk.function_calls:
                    tool_name = chunk.function_calls[0].name
                    print(f"Détection d'un appel à l'outil : {tool_name}")
                    yield f"TOOL_CALL:{tool_name}"
                    break 
                
                if chunk.text:
                    yield chunk.text
                    await asyncio.sleep(0.01)

        except Exception as e:
            print(f"Une erreur est survenue dans l'endpoint chat : {e}")
            yield f"Erreur critique inattendue: {str(e)}"

    return StreamingResponse(stream_response_generator(), media_type="text/plain") 