# Déployer sur Render (dashboard.render.com)

Étapes pour héberger le panel + API auth sur [Render](https://dashboard.render.com/).

---

## 1. Préparer le projet (GitHub)

Render déploie à partir d’un **repo Git**. Si ce n’est pas déjà fait :

1. Crée un repo sur **GitHub** (ex. `panel-auth` ou ton repo existant).
2. À la racine du repo, tu dois avoir au moins le dossier **auth_server** avec :
   - `server.js`
   - `package.json`
   - `public/index.html`
   - (pas besoin de mettre `node_modules` ni `.env` — Render installe et utilise les variables d’environnement.)

**Deux possibilités :**

- **Option A** : ton repo = tout le projet (ex. `engime bo7`). Tu pousses tout, et sur Render tu indiqueras **Root Directory** = `auth_server`.
- **Option B** : ton repo = uniquement le contenu du dossier `auth_server` (server.js, package.json, public/, etc. à la racine). Sur Render tu laisses **Root Directory** vide.

Puis pousse ton code sur GitHub (`git add`, `git commit`, `git push`).

---

## 2. Créer le Web Service sur Render

1. Va sur **https://dashboard.render.com/** et connecte-toi (ou crée un compte).
2. Clique sur **New +** → **Web Service**.
3. Connecte ton **repository GitHub** (autorise Render si demandé) et choisis le repo qui contient `auth_server`.
4. Remplis le formulaire :
   - **Name** : par ex. `panel-auth`.
   - **Region** : celui qui te convient (ex. Frankfurt).
   - **Root Directory** :  
     - si ton repo = tout le projet → mets **`auth_server`**.  
     - si ton repo = uniquement auth_server → laisse **vide**.
   - **Runtime** : **Node**.
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : Free (suffisant pour tester).
5. Clique sur **Advanced** et ajoute les **Environment Variables** :
   - **ADMIN_USER** = `Sramtwo` (ou ton identifiant de connexion au panel).
   - **ADMIN_PASS** = ton mot de passe de connexion au panel (choisis un mot de passe fort).
   - **SYNC_SECRET** = le mot de passe que tu entreras quand tu cliques sur « Sync serveur » dans le panel (choisis une valeur longue et secrète).
6. Clique sur **Create Web Service**. Render va builder et démarrer le service.

---

## 3. Récupérer l’URL

Quand le déploiement est vert (Deploy succeeded), Render affiche une URL du type :

**https://panel-auth-xxxx.onrender.com**

(Ou le nom que tu as donné au service.)  
Ouvre cette URL dans le navigateur : tu dois voir la page de connexion du panel. Connecte-toi avec **ADMIN_USER** / **ADMIN_PASS**, crée des clés, puis **Sync serveur** avec **SYNC_SECRET**.

---

## 4. (Optionnel) Ton propre domaine

1. Dans le dashboard Render, ouvre ton **Web Service** → onglet **Settings**.
2. Descends à **Custom Domains** → **Add Custom Domain**.
3. Saisis ton domaine (ex. **panel.swbservices.xyz**).
4. Render t’indique quoi configurer chez ton registrar DNS (souvent un **CNAME** vers `panel-auth-xxxx.onrender.com`, ou des enregistrements **A** qu’ils fournissent).
5. Une fois le DNS propagé, Render gère le HTTPS pour ce domaine.

Tu pourras alors utiliser **https://panel.swbservices.xyz** comme URL du panel et la mettre dans **auth_config.hpp** :

```cpp
#define AUTH_API_BASE "https://panel.swbservices.xyz"
```

---

## 5. Loader C++

Dans **auth_config.hpp** (à la racine du projet engime bo7), mets l’URL de ton service (avec **https**), **sans slash à la fin** :

- Avec l’URL Render par défaut :
  ```cpp
  #define AUTH_API_BASE "https://panel-auth-xxxx.onrender.com"
  ```
- Ou avec ton domaine :
  ```cpp
  #define AUTH_API_BASE "https://panel.swbservices.xyz"
  ```

Recompile le loader. Les clés que tu as synchronisées depuis le panel seront valides dans le loader.

---

## En résumé

| Étape | Action |
|-------|--------|
| 1 | Repo GitHub avec au moins le dossier `auth_server` (ou son contenu à la racine). |
| 2 | Render → New → Web Service → repo → Root Directory = `auth_server` si besoin, Build = `npm install`, Start = `npm start`. |
| 3 | Environment Variables : **ADMIN_USER**, **ADMIN_PASS**, **SYNC_SECRET**. |
| 4 | Déploiement → noter l’URL (ex. https://panel-auth-xxxx.onrender.com). |
| 5 | (Optionnel) Custom domain dans Settings. |
| 6 | **auth_config.hpp** : `AUTH_API_BASE` = cette URL (sans slash final), recompile le loader. |

Si une étape bloque, dis-moi à laquelle tu es et ce que tu vois (message d’erreur ou écran Render).
