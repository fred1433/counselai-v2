"""
Module de génération de contrats avec architecture en cascade
"""
import google.generativeai as genai
from typing import Dict, List, Optional
from dataclasses import dataclass
import json
import asyncio

@dataclass
class ContractData:
    """Structure des données collectées pour la génération du contrat"""
    contract_type: str
    parties: Dict[str, str]
    key_terms: Dict[str, str]
    special_clauses: List[str]
    context: str
    full_conversation: List[Dict[str, str]]

class ContractGenerator:
    """Générateur de contrats utilisant un LLM spécialisé"""
    
    def __init__(self, api_key: str, model_name: str):
        genai.configure(api_key=api_key)
        self.model_name = model_name
        
    async def extract_contract_data(self, conversation_history: List[Dict]) -> ContractData:
        """
        Extrait les données structurées de la conversation
        Utilise un LLM pour parser intelligemment la conversation
        """
        extraction_prompt = """
        Tu es un expert juridique chargé d'extraire les informations clés d'une conversation entre un avocat et son assistant IA.
        
        Analyse attentivement la conversation suivante et extrais TOUTES les informations pertinentes pour la rédaction du contrat.
        
        Conversation:
        {conversation}
        
        Tu dois extraire et structurer les informations suivantes:
        1. Le type exact de contrat ou de document juridique demandé
        2. Toutes les parties impliquées (noms, rôles, structures juridiques)
        3. Tous les termes clés négociés (montants, dates, pourcentages, localisations, etc.)
        4. Toutes les clauses spéciales ou conditions particulières mentionnées
        5. Le contexte général et l'objectif stratégique de l'opération
        
        Retourne les informations au format JSON structuré suivant:
        {{
            "contract_type": "Type exact du contrat",
            "parties": {{
                "role1": "Nom/Description partie 1",
                "role2": "Nom/Description partie 2",
                ...
            }},
            "key_terms": {{
                "terme1": "valeur1",
                "terme2": "valeur2",
                ...
            }},
            "special_clauses": [
                "Description clause spéciale 1",
                "Description clause spéciale 2",
                ...
            ],
            "context": "Résumé détaillé du contexte et des objectifs"
        }}
        
        IMPORTANT: Sois exhaustif et précis. N'oublie aucun détail mentionné dans la conversation.
        Retourne UNIQUEMENT le JSON, sans commentaire ni texte supplémentaire.
        """
        
        model = genai.GenerativeModel(self.model_name)
        
        # Formater la conversation pour le prompt
        conversation_text = "\n".join([
            f"{msg['role'].upper()}: {msg['parts'][0]['text'] if 'parts' in msg else msg.get('text', '')}"
            for msg in conversation_history
        ])
        
        prompt = extraction_prompt.format(conversation=conversation_text)
        
        try:
            response = await model.generate_content_async(prompt)
            response_text = response.text.strip()
            
            # Essayer de parser comme JSON
            try:
                # Nettoyer la réponse si elle contient des balises markdown
                json_text = response_text
                if json_text.startswith("```json"):
                    json_text = json_text[7:]
                if json_text.startswith("```"):
                    json_text = json_text[3:]
                if json_text.endswith("```"):
                    json_text = json_text[:-3]
                
                data = json.loads(json_text.strip())
                
                return ContractData(
                    contract_type=data.get("contract_type", "Document juridique"),
                    parties=data.get("parties", {}),
                    key_terms=data.get("key_terms", {}),
                    special_clauses=data.get("special_clauses", []),
                    context=data.get("context", ""),
                    full_conversation=conversation_history
                )
            except json.JSONDecodeError:
                # Si ce n'est pas du JSON, extraire l'information du texte brut
                print("Réponse non-JSON reçue, extraction basique des informations")
                
                # Extraction basique mais fonctionnelle
                return ContractData(
                    contract_type="Document juridique à définir",
                    parties={"parties": "Voir conversation"},
                    key_terms={"termes": "Extraits de la conversation"},
                    special_clauses=["Clauses à définir selon la conversation"],
                    context=response_text[:500],  # Premiers 500 caractères comme contexte
                    full_conversation=conversation_history
                )
                
        except Exception as e:
            print(f"Erreur lors de l'extraction: {e}")
            # Fallback simple
            return ContractData(
                contract_type="Document juridique",
                parties={"parties": "Selon conversation"},
                key_terms={"termes": "Selon conversation"},
                special_clauses=["Selon conversation"],
                context="Extraction automatique",
                full_conversation=conversation_history
            )
    
    async def generate_contract(self, contract_data: ContractData, 
                               custom_prompt: Optional[str] = None) -> str:
        """
        Génère le contrat à partir des données structurées
        Utilise un prompt spécialisé pour la génération de contrats premium
        """
        print("📝 Début de la génération du contrat...")
        
        # Premium prompt adapted for all types of legal documents
        generation_prompt = custom_prompt or """
You are the best business lawyer specializing in drafting high-value legal documents.

COMPLETE PREVIOUS CONVERSATION BETWEEN LAWYER AND AI ASSISTANT:
{full_conversation}

Based on this conversation, draft an exceptional legal document in English. The document should demonstrate the highest level of legal sophistication and professionalism and be absolutely COMPLETE, ready to deliver.

Key requirements:
- Exceptional quality worthy of top-tier law firms
- Comprehensive and detailed coverage
- Sophisticated legal language and structure
- Adapt intelligently to the specific type of document needed

Begin directly with the document title.
        """
        
        model = genai.GenerativeModel(self.model_name)
        
        # Formater la conversation complète
        conversation_text = "\n".join([
            f"{msg['role'].upper()}: {msg['parts'][0]['text'] if 'parts' in msg else msg.get('text', '')}"
            for msg in contract_data.full_conversation
        ])
        
        prompt = generation_prompt.format(
            full_conversation=conversation_text
        )
        
        response = await model.generate_content_async(prompt)
        return response.text
    
    async def format_to_html(self, contract_text: str, 
                            html_prompt: Optional[str] = None) -> str:
        """
        Convertit le contrat en HTML professionnel
        Utilise un LLM spécialisé dans la mise en forme
        """
        # Prompt HTML premium adapté pour tout format d'entrée
        formatting_prompt = html_prompt or """
Create a professional legal document in HTML format. Structure it properly with clear margins and formatting suitable for a high-quality contract. Do not include any commentary before or after, just deliver the html.

{contract}
        """
        
        model = genai.GenerativeModel(self.model_name)
        
        prompt = formatting_prompt.format(contract=contract_text)
        response = await model.generate_content_async(prompt)
        html_content = response.text
        
        # Nettoyer les balises markdown de code si présentes
        if html_content.strip().startswith('```html'):
            html_content = html_content.strip()[7:]  # Enlever ```html
        elif html_content.strip().startswith('```'):
            html_content = html_content.strip()[3:]  # Enlever ```
            
        if html_content.strip().endswith('```'):
            html_content = html_content.strip()[:-3]  # Enlever ``` à la fin
            
        return html_content.strip()

# Fonction principale pour la cascade de génération
async def generate_contract_cascade(conversation_history: List[Dict],
                                   api_key: str,
                                   model_name: str,
                                   contract_prompt: Optional[str] = None,
                                   html_prompt: Optional[str] = None) -> Dict[str, str]:
    """
    Fonction principale qui orchestre la cascade de génération
    Version simplifiée qui passe directement la conversation aux LLMs
    
    Returns:
        Dict contenant:
        - 'markdown': Le contrat au format markdown
        - 'html': Le contrat au format HTML
        - 'data': Les données extraites
    """
    generator = ContractGenerator(api_key, model_name)
    
    # Créer un objet ContractData simple avec juste la conversation
    contract_data = ContractData(
        contract_type="Document juridique",
        parties={},
        key_terms={},
        special_clauses=[],
        context="Génération basée sur la conversation",
        full_conversation=conversation_history
    )
    
    # Étape 1: Génération du contrat directement depuis la conversation
    contract_markdown = await generator.generate_contract(
        contract_data, 
        custom_prompt=contract_prompt
    )
    
    # Étape 2: Mise en forme HTML
    contract_html = await generator.format_to_html(
        contract_markdown,
        html_prompt=html_prompt
    )
    
    return {
        'markdown': contract_markdown,
        'html': contract_html,
        'data': {
            'status': 'generated_from_conversation',
            'conversation_length': len(conversation_history)
        }
    }