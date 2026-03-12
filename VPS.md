# Tout faire sur un VPS

Tu peux héberger le panel + l’API sur **ton propre VPS** (OVH, Contabo, Hetzner, DigitalOcean, etc.). Une seule machine, ton domaine, pas de limite Render/Railway.

---

## 1. Ce qu’il te faut

- Un **VPS** (Linux, ex. Ubuntu 22.04) avec une IP publique.
- (Optionnel) Un **nom de domaine** pointant vers cette IP (ex. panel.swbservices.xyz → IP du VPS).

---

## 2. Sur le VPS : installer Node.js

En SSH sur le VPS :

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install -y nodejs npm

# Vérifier (il faut au moins Node 18)
node -v
npm -v
```

Si la version de Node est trop vieille, utilise NodeSource :

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## 3. Mettre le projet sur le VPS

- Soit tu **upload** le dossier `auth_server` (FTP, SFTP, ou zip + `scp`).
- Soit tu clones ton repo Git :

```bash
cd ~
git clone https://github.com/TON_USER/TON_REPO.git
cd TON_REPO/auth_server
# (ou cd TON_REPO si auth_server est à la racine)
```

Puis :

```bash
npm install
```

---

## 4. Fichier .env

Crée un fichier `.env` dans le dossier du serveur (là où il y a `server.js`) :

```bash
nano .env
```

Contenu (adapte les valeurs) :

```
PORT=3000
ADMIN_USER=Sramtwo
ADMIN_PASS=ton_mot_de_passe_panel
SYNC_SECRET=ton_mot_de_passe_sync_serveur
```

Sauvegarde (Ctrl+O, Entrée, Ctrl+X).

---

## 5. Lancer le serveur (et le garder allumé)

**Test rapide :**

```bash
npm start
```

Tu devrais voir « Auth server: http://localhost:3000 ». Pour que ça tourne en continu même après déconnexion SSH, utilise **pm2** :

```bash
sudo npm install -g pm2
pm2 start server.js --name panel-auth
pm2 save
pm2 startup
```

Le serveur écoute sur le port **3000**. Pour y accéder depuis l’extérieur, ouvre le port **3000** dans le firewall du VPS (et éventuellement dans le pare-feu du panel de ton hébergeur).

- Accès direct : **http://IP_DU_VPS:3000**
- Si tu as un domaine qui pointe vers l’IP : **http://panel.swbservices.xyz:3000**

---

## 6. (Recommandé) HTTPS avec Nginx

Pour avoir **https://panel.swbservices.xyz** (sans :3000) et un certificat SSL gratuit :

1. Installe Nginx et Certbot :

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

2. Pointe ton **domaine** (ex. panel.swbservices.xyz) vers l’IP du VPS (A ou CNAME chez ton registrar).

3. Crée un vhost Nginx :

```bash
sudo nano /etc/nginx/sites-available/panel-auth
```

Contenu (remplace `panel.swbservices.xyz` par ton domaine) :

```nginx
server {
    listen 80;
    server_name panel.swbservices.xyz;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Puis :

```bash
sudo ln -s /etc/nginx/sites-available/panel-auth /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d panel.swbservices.xyz
```

Certbot ajoute le HTTPS. Tu pourras utiliser **https://panel.swbservices.xyz**.

---

## 7. Loader C++

Dans **auth_config.hpp** :

- Si tu accèdes en **http://IP:3000** :  
  `#define AUTH_API_BASE "http://IP_DU_VPS:3000"`
- Si tu as mis Nginx + domaine en **HTTPS** :  
  `#define AUTH_API_BASE "https://panel.swbservices.xyz"`

(sans slash à la fin). Recompile le loader.

---

## Résumé

| Étape | Action |
|-------|--------|
| 1 | VPS + (optionnel) domaine pointant vers l’IP |
| 2 | Installer Node.js (18+) sur le VPS |
| 3 | Copier `auth_server` sur le VPS, `npm install` |
| 4 | Créer `.env` avec ADMIN_USER, ADMIN_PASS, SYNC_SECRET |
| 5 | Lancer avec `pm2 start server.js --name panel-auth` |
| 6 | (Optionnel) Nginx + Certbot pour HTTPS et ton domaine |
| 7 | **auth_config.hpp** : AUTH_API_BASE = l’URL du panel (http ou https) |

Oui frero, tu peux tout faire sur un VPS.
