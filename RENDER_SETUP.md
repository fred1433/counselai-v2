# 🔴 Configuration Suspension Automatique

## Service configuré pour se suspendre automatiquement le 9 février 2025

### Pour configurer la suspension automatique :

1. **Obtenez votre Render API Key** :
   - Allez sur https://dashboard.render.com/u/settings
   - Section "API Keys"
   - Créez une nouvelle clé : "counselai-auto-suspend"
   - Copiez la clé

2. **Ajoutez la clé à GitHub** :
   - Allez sur https://github.com/fred1433/counselai-v2/settings/secrets/actions
   - Cliquez "New repository secret"
   - Name: `RENDER_API_KEY`
   - Value: [Collez votre clé API]
   - Cliquez "Add secret"

### Dates importantes :
- **Déployé le** : 19 janvier 2025
- **Suspension auto** : 9 février 2025 (3 semaines)
- **Coût total estimé** : ~$5

### Pour changer la date :
Éditez `.github/workflows/auto-suspend.yml` et modifiez la ligne cron

### Pour suspendre manuellement :
1. Render Dashboard → Service → Suspend
2. Ou : Actions GitHub → Run workflow manually