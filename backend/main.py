from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import google.generativeai as genai
import os
from dotenv import load_dotenv
import asyncio
from google.generativeai.types import GenerationConfig
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


# The Master Prompt that guides the AI
MASTER_PROMPT = """
You are an expert business law assistant specializing in contract top tier contract drafting.
Your goal is to help top tier lawyers draft complex legal documents following a precise and complete methodology.
Don't loose time in greeting and politeness with the lawyers, but respond directly to their request, as a first message is already present in the interface, so the conversation is always already begun with the initial message: "For this new mandate, what is the primary strategic objective your client is seeking to achieve?" So the first message you will receive from the lawyer will probably answer this question.

1. Dialogue and collection Your goal is to collect ALL information necessary to write a very complete, professional legal document, not a draft.

(Of course, this includes party details, addresses, signatories, and every element required for a binding, but you must start with the more clever questions)

2. **Await confirmation:** Once you have gathered absolutely all essential information, provide a comprehensive summary and ask for clear confirmation, such as "Shall we proceed with generating the document?".
3. **Tool call:** After receiving confirmation from the lawyer, respond ONLY with: {"action": "generate_document"}
"""

LAWYER_SIMULATOR_PROMPT = """You are a top-tier business lawyer handling high-value transactions. Your AI assistant asks you questions to draft legal documents. Always provide concrete, realistic answers - never say information is missing. Invent plausible high-value business scenarios. Be concise."""

CONTRACT_MODIFICATION_PROMPT = """
You are a legal document modification expert. You help lawyers modify contracts efficiently.

You receive:
1. The current HTML of a legal document (which may include manual edits)
2. A modification request from the lawyer

Your task:
- Analyze the modification request
- Provide clear guidance on how to implement the change
- If the modification is simple and specific, provide the exact text to change
- If the modification is complex, explain what needs to be changed and why
- Always maintain legal precision and professionalism

Be concise and practical. Focus on actionable advice.
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
    print(f"\n🔍 Historique reçu par le simulateur d'avocat:")
    for i, msg in enumerate(request.history):
        print(f"  [{i}] {msg['role']}: {msg['parts'][0]['text'][:100]}...")
    
    try:
        # Utilise un modèle dédié avec le prompt du simulateur d'avocat
        lawyer_model = genai.GenerativeModel(
            model_name=os.getenv("GEMINI_MODEL_NAME", "gemini-pro"),
            system_instruction=LAWYER_SIMULATOR_PROMPT
        )
        
        chat_session = lawyer_model.start_chat(history=request.history)
        # On ne streame pas, on veut la réponse complète directement
        # Extraire la dernière question de l'assistant
        last_ai_question = None
        for msg in reversed(request.history):
            if msg['role'] == 'model':
                last_ai_question = msg['parts'][0]['text']
                break
        
        print(f"\n📝 Dernière question de l'assistant: {last_ai_question[:200]}...")
        
        prompt = f"Based on the conversation history, answer this specific question from the assistant: {last_ai_question}"
        response = await chat_session.send_message_async(prompt)
        
        print(f"\n✅ Réponse générée: {response.text[:200]}...")
        
        return {"response": response.text}

    except Exception as e:
        print(f"Erreur lors de la génération de la réponse de l'avocat : {e}")
        raise HTTPException(status_code=500, detail="Erreur interne du serveur")

class GenerateContractRequest(BaseModel):
    history: list

class ModifyContractRequest(BaseModel):
    current_html: str
    modification_request: str
    history: list = []

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

@app.post("/api/modify_contract")
async def modify_contract(request: ModifyContractRequest):
    """
    Endpoint pour modifier un contrat existant basé sur les demandes de l'utilisateur.
    """
    try:
        # Créer un modèle avec le prompt de modification
        modification_model = genai.GenerativeModel(
            model_name=os.getenv("GEMINI_MODEL_NAME", "gemini-pro"),
            system_instruction=CONTRACT_MODIFICATION_PROMPT
        )
        
        # Préparer le contexte pour l'assistant
        context = f"""
Current HTML Document:
{request.current_html}

Modification Request:
{request.modification_request}
"""
        
        # Si historique disponible, l'inclure
        if request.history:
            chat_session = modification_model.start_chat(history=request.history)
            response = await chat_session.send_message_async(context)
        else:
            response = await modification_model.generate_content_async(context)
        
        return {"response": response.text}
        
    except Exception as e:
        print(f"Erreur lors de la modification du contrat : {e}")
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
                system_instruction=MASTER_PROMPT
            )
            
            chat_session = model.start_chat(history=request.history)
            
            print(f"\n📨 Message reçu de l'utilisateur: {request.text[:200]}...")
            
            # Vérifier si c'est une confirmation pour générer le document
            confirmation_keywords = ["yes", "proceed", "go ahead", "please generate", "confirmed", "correct", "accurate"]
            user_text_lower = request.text.lower()
            is_confirmation = any(keyword in user_text_lower for keyword in confirmation_keywords)
            
            if is_confirmation:
                print(f"✅ Confirmation détectée! Vérification du contexte...")
                # Vérifier si on a assez d'infos dans l'historique
                has_summary = any("shall we proceed" in msg.get('parts', [{}])[0].get('text', '').lower() 
                                 for msg in request.history if msg.get('role') == 'model')
                if has_summary:
                    print(f"📋 Résumé trouvé dans l'historique, activation de l'outil...")
            
            response = await chat_session.send_message_async(request.text, stream=True)

            # Boucle de streaming unique et propre pour corriger le bug de répétition.
            async for chunk in response:
                try:
                    # Vérifier d'abord les appels de fonction
                    if hasattr(chunk, 'candidates') and chunk.candidates:
                        candidate = chunk.candidates[0]
                        if hasattr(candidate.content, 'parts') and candidate.content.parts:
                            for part in candidate.content.parts:
                                if hasattr(part, 'function_call') and part.function_call:
                                    tool_name = part.function_call.name
                                    print(f"🛠️ Détection d'un appel à l'outil : {tool_name}")
                                    yield f"TOOL_CALL:{tool_name}"
                                    return  # Arrêter le streaming après l'appel d'outil
                    
                    # Ensuite vérifier le texte
                    if hasattr(chunk, 'text'):
                        try:
                            text = chunk.text
                            if text:
                                yield text
                                await asyncio.sleep(0.01)
                        except Exception as text_error:
                            # Ignorer les erreurs de texte et continuer
                            pass
                except Exception as chunk_error:
                    # Ignorer les chunks problématiques et continuer
                    pass

        except Exception as e:
            print(f"Une erreur est survenue dans l'endpoint chat : {e}")
            yield f"Erreur critique inattendue: {str(e)}"

    return StreamingResponse(stream_response_generator(), media_type="text/plain") 