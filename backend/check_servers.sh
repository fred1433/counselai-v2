#!/bin/bash

echo "🔍 Vérification des serveurs CounselAI..."

# Vérifier le backend
if curl -s http://localhost:8001 > /dev/null; then
    echo "✅ Backend en cours d'exécution sur http://localhost:8001"
else
    echo "❌ Backend non accessible sur le port 8001"
fi

# Vérifier le frontend
if curl -s http://localhost:5174 > /dev/null; then
    echo "✅ Frontend en cours d'exécution sur http://localhost:5174"
else
    echo "❌ Frontend non accessible sur le port 5174"
fi