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
    "https://counselai-frontend-prod.onrender.com",
    "https://counselai-v2.onrender.com"
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
    model_name: str = "gemini-2.5-pro"  # Par défaut

class GenerateLawyerResponseRequest(BaseModel):
    history: list = []
    model_name: str = "gemini-2.5-pro"


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
1. The current HTML of a legal document
2. A modification request from the lawyer

Your task:
- Analyze the modification request carefully
- Apply the requested changes directly to the HTML
- Maintain the existing HTML structure and styling
- Preserve all unchanged content exactly as is
- Ensure legal precision and proper language

For example:
- If asked to "rewrite the document", you should completely rewrite the content while keeping the HTML structure
- If asked to "add a clause about X", insert the new clause in the appropriate section
- If asked to "change the company name to Y", replace all instances of the company name

CRITICAL RULES:
1. You MUST return the COMPLETE modified HTML document
2. You MUST return ONLY HTML - no explanations, no markdown, no comments
3. You MUST make actual changes based on the request
4. You MUST preserve the HTML structure and tags
5. The output should start with HTML tags (like <h1>, <p>, <div>, etc.)
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
            model_name=request.model_name,
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
        print(f"Type d'erreur: {type(e).__name__}")
        print(f"Détails complets: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur: {str(e)}")

class GenerateContractRequest(BaseModel):
    history: list
    model_name: str = "gemini-2.5-pro"

class ModifyContractRequest(BaseModel):
    current_html: str
    modification_request: str
    history: list = []
    model_name: str = "gemini-2.5-pro"

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
            model_name=request.model_name
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
    Utilise le 4e assistant IA pour appliquer les modifications directement au HTML.
    """
    print(f"🔧 Modification request: {request.modification_request[:100]}...")
    
    try:
        # Créer un modèle avec le prompt de modification
        modification_model = genai.GenerativeModel(
            model_name=request.model_name,
            system_instruction=CONTRACT_MODIFICATION_PROMPT
        )
        
        # Préparer le contexte pour l'assistant
        context = f"""
Current HTML Document:
{request.current_html}

Modification Request:
{request.modification_request}

Remember: Return ONLY the modified HTML, no explanations.
"""
        
        # Générer la réponse
        response = await modification_model.generate_content_async(context)
        modified_html = response.text.strip()
        
        print(f"📝 Modification request: {request.modification_request}")
        print(f"📄 Response length: {len(modified_html)} characters")
        print(f"📄 Response preview: {modified_html[:200]}...")
        
        # Vérifier si la réponse contient du HTML
        if '<' in modified_html and '>' in modified_html:
            # Nettoyer le HTML si nécessaire
            if '<body' in modified_html.lower():
                # Extraire seulement le contenu du body
                import re
                body_match = re.search(r'<body[^>]*>(.*)</body>', modified_html, re.DOTALL | re.IGNORECASE)
                if body_match:
                    modified_html = body_match.group(1)
            
            print(f"✅ HTML modification successful")
            return {
                "response": "✓ Document updated successfully",
                "modified_html": modified_html
            }
        else:
            # Si pas de HTML, c'est que l'IA a donné des conseils au lieu de modifier
            print(f"⚠️ No HTML in response, returning advice instead")
            return {
                "response": modified_html,
                "modified_html": None
            }
        
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
                model_name=request.model_name,
                system_instruction=MASTER_PROMPT
            )
            
            # Valider et nettoyer l'historique
            cleaned_history = []
            for msg in request.history:
                if isinstance(msg, dict) and 'role' in msg and 'parts' in msg:
                    cleaned_history.append(msg)
                else:
                    print(f"⚠️ Message mal formé dans l'historique: {msg}")
            
            chat_session = model.start_chat(history=cleaned_history)
            
            # Affichage sécurisé du message avec gestion des caractères spéciaux
            try:
                preview = request.text[:200].encode('utf-8', errors='replace').decode('utf-8')
                print(f"\n📨 Message reçu de l'utilisateur: {preview}...")
            except Exception as e:
                print(f"\n📨 Message reçu (impossible d'afficher le preview): {e}")
            
            # Vérifier si c'est une confirmation pour générer le document
            confirmation_keywords = ["yes", "proceed", "go ahead", "please generate", "confirmed", "correct", "accurate"]
            user_text_lower = request.text.lower()
            is_confirmation = any(keyword in user_text_lower for keyword in confirmation_keywords)
            
            if is_confirmation:
                print(f"✅ Confirmation détectée! Vérification du contexte...")
                # Vérifier si on a assez d'infos dans l'historique
                has_summary = False
                for msg in request.history:
                    if msg.get('role') == 'model':
                        parts = msg.get('parts', [])
                        if parts and len(parts) > 0 and isinstance(parts[0], dict):
                            text = parts[0].get('text', '')
                            if 'shall we proceed' in text.lower():
                                has_summary = True
                                break
                if has_summary:
                    print(f"📋 Résumé trouvé dans l'historique, activation de l'outil...")
            
            response = await chat_session.send_message_async(request.text, stream=True)

            # Boucle de streaming unique et propre pour corriger le bug de répétition.
            async for chunk in response:
                try:
                    # Vérifier d'abord les appels de fonction
                    if hasattr(chunk, 'candidates') and chunk.candidates and len(chunk.candidates) > 0:
                        candidate = chunk.candidates[0]
                        if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts') and candidate.content.parts:
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
                            # Log l'erreur mais continuer le streaming
                            print(f"⚠️ Erreur lors du traitement du texte: {text_error}")
                            print(f"   Type de chunk: {type(chunk)}")
                            print(f"   Chunk complet: {chunk}")
                except Exception as chunk_error:
                    # Log l'erreur mais continuer le streaming
                    print(f"⚠️ Erreur lors du traitement du chunk: {chunk_error}")
                    print(f"   Type de chunk: {type(chunk)}")
                    try:
                        print(f"   Chunk complet: {chunk}")
                    except:
                        print("   Impossible d'afficher le chunk")

        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"❌ Erreur critique dans l'endpoint chat:")
            print(f"   Type d'erreur: {type(e).__name__}")
            print(f"   Message: {str(e)}")
            print(f"   Traceback complet:\n{error_details}")
            
            # Encoder le message d'erreur pour éviter les problèmes de caractères spéciaux
            error_msg = f"Erreur critique inattendue: {type(e).__name__} - {str(e)}"
            # Remplacer les caractères problématiques
            error_msg = error_msg.replace('\n', ' ').replace('\r', ' ')
            yield error_msg

    return StreamingResponse(stream_response_generator(), media_type="text/plain") 