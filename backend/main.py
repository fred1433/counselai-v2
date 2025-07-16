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
from contract_generator import generate_contract_cascade

load_dotenv()

app = FastAPI()

# Configuration du CORS pour autoriser les requêtes du frontend
origins = [
    "http://localhost",
    "http://localhost:5173", # Port par défaut de Vite/React
    "http://localhost:5174", # Port configuré pour ce projet
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

# The Master Prompt that guides the AI
MASTER_PROMPT = """
You are "CounselAI", an expert business law assistant specializing in contract drafting.
Your goal is to help lawyers draft complex legal documents following a precise methodology.
You must NEVER greet the user, but respond directly to their request, as a welcome message is already present in the interface.

Here is your workflow:
1. **Dialogue and collection:** Your goal is to collect all the information and key clauses necessary to draft a document. Ask precise questions to clarify each point through dialogue with the user.
2. **Await confirmation:** Once you believe you have all the information, ask the user for clear confirmation, such as "Shall we proceed with generating the document?".
3. **Tool call:** Only after receiving this explicit confirmation, you MUST call the `lancer_cascade_generation` tool. Write nothing else in your response.

Never deviate from this workflow.
"""

LAWYER_SIMULATOR_PROMPT = """
**Your Role:**
You are an experienced business lawyer in dialogue with your AI assistant (CounselAI).
Your assistant asks you questions to gather all the information necessary to draft a contract.

**Your Mission:**
Answer **directly** to the assistant's **last question**.
Provide concrete, plausible, and concise information in English.
Add no greetings or superfluous phrases. NEVER ask questions in return.

**Example:**
If the assistant asks: "What is the name of the client company?"
Your answer should be: "The company is called Innovatech LLC."
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

class GenerateContractRequest(BaseModel):
    history: list

@app.post("/api/generate_contract")
async def generate_contract(request: GenerateContractRequest):
    """
    Endpoint pour générer un contrat basé sur l'historique de conversation.
    Utilise l'architecture en cascade avec des LLMs spécialisés.
    """
    print(f"🔥 /api/generate_contract appelé avec {len(request.history)} messages dans l'historique")
    
    try:
        # Utiliser la cascade de génération avec le modèle depuis l'environnement
        print(f"🚀 Lancement de generate_contract_cascade...")
        result = await generate_contract_cascade(
            conversation_history=request.history,
            api_key=GEMINI_API_KEY,
            model_name=os.getenv("GEMINI_MODEL_NAME", "gemini-pro")
        )
        
        return {
            "status": "success",
            "contract_markdown": result['markdown'],
            "contract_html": result['html'],
            "extracted_data": result['data']
        }
    
    except Exception as e:
        print(f"Erreur lors de la génération du contrat : {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
                # Vérifier d'abord les appels de fonction
                if hasattr(chunk, 'candidates') and chunk.candidates:
                    candidate = chunk.candidates[0]
                    if hasattr(candidate.content, 'parts') and candidate.content.parts:
                        for part in candidate.content.parts:
                            if hasattr(part, 'function_call') and part.function_call:
                                tool_name = part.function_call.name
                                print(f"Détection d'un appel à l'outil : {tool_name}")
                                yield f"TOOL_CALL:{tool_name}"
                                return  # Arrêter le streaming après l'appel d'outil
                
                # Ensuite vérifier le texte
                if hasattr(chunk, 'text') and chunk.text:
                    yield chunk.text
                    await asyncio.sleep(0.01)

        except Exception as e:
            print(f"Une erreur est survenue dans l'endpoint chat : {e}")
            yield f"Erreur critique inattendue: {str(e)}"

    return StreamingResponse(stream_response_generator(), media_type="text/plain") 