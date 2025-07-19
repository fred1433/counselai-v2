# 🚀 Déploiement Rapide CounselAI

## Votre repo GitHub est prêt !
URL: https://github.com/fred1433/counselai-v2

## Étapes pour déployer sur Render (5 minutes)

### 1. Créer un compte Render
👉 https://render.com/register

### 2. Déployer le Backend
1. Cliquez sur **"New +"** → **"Web Service"**
2. Connectez votre compte GitHub
3. Cherchez et sélectionnez **counselai-v2**
4. Configuration :
   - **Name**: counselai-backend
   - **Root Directory**: backend
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. **Environment Variables** (cliquez sur "Advanced") :
   - Ajoutez : `GEMINI_API_KEY` = [Votre clé API Gemini]
6. Cliquez **"Create Web Service"**

### 3. Déployer le Frontend
1. Attendez que le backend soit déployé (5 min)
2. Copiez l'URL du backend (ex: https://counselai-backend.onrender.com)
3. Cliquez sur **"New +"** → **"Static Site"**
4. Sélectionnez à nouveau **counselai-v2**
5. Configuration :
   - **Name**: counselai-frontend
   - **Root Directory**: frontend
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: dist
6. **Environment Variables** :
   - Ajoutez : `VITE_API_URL` = [URL du backend copiée]
7. Cliquez **"Create Static Site"**

### 4. C'est prêt !
- Frontend URL : https://counselai-frontend.onrender.com
- Backend URL : https://counselai-backend.onrender.com

## Notes importantes
- **Première visite** : ~30 secondes de chargement (réveil du serveur)
- **Tier gratuit** : S'endort après 15 min d'inactivité
- **Pour la démo** : Visitez 5 min avant pour réveiller l'app

## Tester localement d'abord ?
```bash
cd backend
./run_dev.sh

# Dans un autre terminal
cd frontend
npm run dev
```

Accédez à http://localhost:5174