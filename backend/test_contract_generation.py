"""
Test simple de la génération de contrat
"""
import pytest
import asyncio
import os
from dotenv import load_dotenv
from contract_generator import generate_contract_cascade

load_dotenv()

@pytest.mark.asyncio
@pytest.mark.skip(reason="Test manuel nécessitant une clé API Gemini valide")
async def test_contract_generation():
    # Historique simple pour test
    history = [
        {"role": "user", "parts": [{"text": "Je veux un contrat de vente"}]},
        {"role": "model", "parts": [{"text": "D'accord, pour qui ?"}]},
        {"role": "user", "parts": [{"text": "Entre Société A et Société B"}]},
    ]
    
    result = await generate_contract_cascade(
        conversation_history=history,
        api_key=os.getenv("GEMINI_API_KEY"),
        model_name=os.getenv("GEMINI_MODEL_NAME", "gemini-pro")
    )
    assert result is not None
    assert 'markdown' in result
    assert 'html' in result

async def main():
    """Pour tests manuels"""
    history = [
        {"role": "user", "parts": [{"text": "Je veux un contrat de vente"}]},
        {"role": "model", "parts": [{"text": "D'accord, pour qui ?"}]},
        {"role": "user", "parts": [{"text": "Entre Société A et Société B"}]},
    ]
    
    try:
        result = await generate_contract_cascade(
            conversation_history=history,
            api_key=os.getenv("GEMINI_API_KEY"),
            model_name=os.getenv("GEMINI_MODEL_NAME", "gemini-pro")
        )
        print("✅ Succès!")
        print(f"Markdown (extrait): {result['markdown'][:200]}...")
    except Exception as e:
        print(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())