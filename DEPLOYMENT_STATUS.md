# 🚀 CounselAI V2 - Déploiement Réussi !

## 📱 Votre Application

### URLs en production :
- **Application** : https://counselai-frontend-v2.onrender.com
- **API Backend** : https://counselai-backend-v2.onrender.com

### Tableaux de bord Render :
- [Backend Dashboard](https://dashboard.render.com/web/srv-d1tqv2idbo4c73dtdg40)
- [Frontend Dashboard](https://dashboard.render.com/static/srv-d1tqvec9c44c73cbm2h0)

## 💰 Coûts et Suspension

- **Plan** : Starter ($7/mois)
- **Durée active** : 12 jours (jusqu'au 31 janvier 2025)
- **Coût total estimé** : ~$2.80
- **Suspension automatique** : ✅ Configurée pour le 31 janvier

## 🔑 Clés API configurées

- ✅ **GEMINI_API_KEY** : Configurée dans le backend
- ✅ **RENDER_API_KEY** : Configurée dans GitHub Secrets

## ⏱️ Temps de déploiement

- Premier déploiement : ~5-10 minutes
- L'app sera accessible dès que le build est terminé

## 🎯 Pour la démo client

1. **Pas de mise en veille** avec le plan Starter
2. **Performance constante** - chargement rapide
3. **Features de dev cachées** en production

## 🛠️ Gestion post-démo

### Pour suspendre manuellement :
```bash
# Via GitHub Actions
gh workflow run auto-suspend.yml

# Ou directement dans Render Dashboard
# Backend → Settings → Suspend Service
```

### Pour réactiver plus tard :
1. Render Dashboard → Service → Resume
2. Ou créez un nouveau déploiement

## 📝 Notes

- Les logs sont disponibles dans le dashboard Render
- Le backend redémarre automatiquement en cas d'erreur
- Frontend servi via CDN global de Render