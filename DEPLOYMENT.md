# CounselAI Deployment Guide

## Quick Deployment to Render

### Prerequisites
1. Create a [Render](https://render.com) account
2. Have your Gemini API key ready

### Steps

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Prepare for deployment"
   git push origin master
   ```

2. **Deploy Backend**
   - Go to Render Dashboard
   - Click "New +" → "Web Service"
   - Connect your GitHub repo
   - Select the repository
   - Configure:
     - Name: `counselai-backend`
     - Root Directory: `backend`
     - Runtime: Python
     - Build Command: `pip install -r requirements.txt`
     - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Add Environment Variable:
     - Key: `GEMINI_API_KEY`
     - Value: Your Gemini API key
   - Click "Create Web Service"

3. **Deploy Frontend**
   - Click "New +" → "Static Site"
   - Connect same GitHub repo
   - Configure:
     - Name: `counselai-frontend`
     - Root Directory: `frontend`
     - Build Command: `npm install && npm run build`
     - Publish Directory: `dist`
   - Add Environment Variable:
     - Key: `VITE_API_URL`
     - Value: `https://counselai-backend.onrender.com` (your backend URL)
   - Click "Create Static Site"

4. **Update Frontend URL**
   After backend is deployed:
   - Copy the backend URL
   - Update `frontend/.env.production` with the actual backend URL
   - Commit and push the change

### Notes
- Both services will be on free tier (may sleep after 15 min of inactivity)
- First load after sleep takes ~30 seconds
- For production, consider upgrading to paid tier

### Testing Production Locally
```bash
# Backend
cd backend
uvicorn main:app --reload

# Frontend (production build)
cd frontend
npm run build
npm run preview
```