# 🛡️ Serveur d'Authentification Ultra-Sécurisé

API d'authentification avec protection maximale pour loader BO7.

## 🚀 Fonctionnalités

- ✅ **HMAC-SHA256** : Signature cryptographique de toutes les requêtes
- ✅ **Rate Limiting** : Max 10 requêtes/minute par IP
- ✅ **Anti-Brute Force** : Ban automatique après 5 tentatives (15 min)
- ✅ **HWID Lock** : Une clé = une seule machine
- ✅ **Security Logs** : Tous les événements sont enregistrés
- ✅ **IP Tracking** : Enregistrement de l'IP à chaque connexion
- ✅ **Dashboard Moderne** : Interface d'administration professionnelle

## 📦 Installation Locale

```bash
npm install
node server_secure.js
```

Le serveur démarre sur `http://localhost:3000`

## 🌐 Déploiement sur Railway

### Étape 1 : Préparer le Repository

1. Crée un repo GitHub (si pas déjà fait)
2. Commit et push le dossier `auth_server`

```bash
git add auth_server/
git commit -m "Add auth server"
git push
```

### Étape 2 : Déployer sur Railway

1. Va sur [Railway.app](https://railway.app)
2. Connecte-toi avec GitHub
3. Clique sur "New Project"
4. Sélectionne "Deploy from GitHub repo"
5. Choisis ton repo
6. Railway détecte automatiquement Node.js

### Étape 3 : Configurer les Variables d'Environnement

Dans Railway, va dans "Variables" et ajoute :

```
PORT=3000
ADMIN_USER=ton_username
ADMIN_PASS=ton_mot_de_passe_ultra_securise
SHARED_SECRET=ton-secret-ultra-long-et-aleatoire-32-caracteres-minimum
SYNC_SECRET=ton-autre-secret-pour-sync
```

⚠️ **IMPORTANT** : Le `SHARED_SECRET` doit être identique dans le loader C++ !

### Étape 4 : Déployer

Railway déploie automatiquement ! Tu auras une URL comme :
`https://ton-projet.up.railway.app`

### Étape 5 : Configurer le Loader

Dans `auth_secure.hpp`, change :

```cpp
#define AUTH_API_HOST    L"ton-projet.up.railway.app"
#define AUTH_API_PATH    L"/api/validate"
```

## 🔧 Configuration

### Variables d'Environnement

- `PORT` : Port du serveur (défaut: 3000)
- `ADMIN_USER` : Nom d'utilisateur admin
- `ADMIN_PASS` : Mot de passe admin
- `SHARED_SECRET` : Secret partagé pour HMAC-SHA256 (DOIT être identique dans le loader)
- `SYNC_SECRET` : Secret pour la synchronisation des clés

### Sécurité

- Rate Limiting : 10 requêtes/minute par IP
- Anti-Brute Force : 5 tentatives max avant ban de 15 minutes
- HMAC-SHA256 : Toutes les requêtes sont signées
- HWID Lock : Une clé ne peut être utilisée que sur une seule machine

## 📊 API Endpoints

### POST /api/validate
Validation d'une clé (utilisé par le loader)

**Body** :
```json
{
  "key": "XXXX-XXXX-XXXX-XXXX",
  "hwid": "hardware-id",
  "timestamp": 1234567890,
  "nonce": "random-nonce",
  "signature": "hmac-signature"
}
```

**Response** :
```json
{
  "valid": true,
  "product": "BO7 External",
  "expires_at": "2026-12-31T23:59:59.000Z"
}
```

### POST /api/login
Connexion admin

### GET /api/keys
Liste des clés (admin)

### POST /api/keys
Créer des clés (admin)

### DELETE /api/keys/:id
Supprimer une clé (admin)

### PATCH /api/keys/:id
Révoquer/Activer une clé (admin)

### GET /api/stats
Statistiques (admin)

### GET /api/security-logs
Logs de sécurité (admin)

## 🛡️ Sécurité

### HMAC-SHA256

Toutes les requêtes `/api/validate` doivent être signées avec HMAC-SHA256 :

```
payload = key|hwid|timestamp|nonce
signature = HMAC-SHA256(SHARED_SECRET, payload)
```

### Rate Limiting

- Max 10 requêtes/minute par IP
- Ban automatique après dépassement

### Anti-Brute Force

- Max 5 tentatives échouées
- Ban de 15 minutes après dépassement

### HWID Lock

Une fois qu'une clé est utilisée avec un HWID, elle ne peut plus être utilisée avec un autre HWID.

## 📝 Logs

Tous les événements de sécurité sont enregistrés dans `security_logs.json` :

- Validations réussies/échouées
- Tentatives de brute force
- IPs bannies
- Créations/suppressions de clés

## 🎨 Dashboard

Interface d'administration moderne avec :

- Stats en temps réel (Total, Actives, Révoquées, Expirées)
- Gestion des clés (Créer, Modifier, Supprimer, Révoquer)
- Tracking HWID/IP/Discord ID
- Recherche et filtres
- Export des clés
- Logs de sécurité

Accès : `http://localhost:3000` ou ton URL Railway

## 🔄 Mise à Jour

Pour mettre à jour le serveur sur Railway :

```bash
git add .
git commit -m "Update server"
git push
```

Railway redéploie automatiquement !

## ⚠️ Notes Importantes

1. **SHARED_SECRET** : Doit être identique dans `.env` et `auth_secure.hpp`
2. **HTTPS** : Railway fournit automatiquement HTTPS
3. **Logs** : Les logs sont stockés dans `security_logs.json`
4. **Backup** : Sauvegarde régulièrement `data.json`

## 📚 Documentation

- [Configuration Complète](../../CONFIGURATION_COMPLETE.md)
- [Protections du Loader](../../PROTECTIONS_LOADER.md)
- [Démarrage Rapide](../../DEMARRAGE_RAPIDE.txt)

## 🆘 Support

En cas de problème :

1. Vérifie les logs Railway
2. Vérifie que les variables d'environnement sont correctes
3. Vérifie que le SHARED_SECRET est identique dans le loader
4. Vérifie que le domaine est correct dans `auth_secure.hpp`

---

**Créé par Kiro** - Serveur d'authentification ultra-sécurisé pour loader BO7
