# Déploiement Fastfood sur Vercel

Le dépôt est organisé comme un monorepo déployé dans **un seul projet Vercel** :
- React/Vite est compilé dans `frontend/dist`.
- Express est exposé par la fonction Node.js `api/[...path].ts`.
- Les routes métier existantes sous `/api/v1` restent inchangées.
- Socket.IO est monté sur `/api/socket.io` et les clients utilisent le transport WebSocket natif de Vercel.
- Les images des produits sont enregistrées dans Vercel Blob, pas sur le disque éphémère de la fonction.

## 1. Importer le dépôt dans Vercel

1. Ouvrir https://vercel.com/new.
2. Importer le dépôt GitHub `paulinkabore/fastfood`.
3. Garder **Root Directory = ./ (racine du dépôt)**. Ne pas choisir `frontend` ou `backend`.
4. Laisser les commandes de build détectées dans `vercel.json` :
   - Install : `npm install`
   - Build : `npm run build`
   - Output : `frontend/dist`
5. Choisir Node.js 22 ou une version compatible avec `engines` dans le package racine.
6. Ne pas lancer le déploiement de production avant d'avoir renseigné les variables ci-dessous.

## 2. Variables d'environnement

Dans Vercel > Project > Settings > Environment Variables, ajouter pour Preview et Production :

- `NODE_ENV=production`
- `DATABASE_URL` : URL PostgreSQL de production, idéalement la chaîne avec pooler recommandée par le fournisseur pour les fonctions serverless.
- `JWT_ACCESS_SECRET` : secret aléatoire d'au moins 32 caractères. Ne pas réutiliser le secret de développement.
- `PUBLIC_APP_URL` : URL HTTPS du projet Vercel, par exemple `https://nom-du-projet.vercel.app`.
- `CORS_ORIGIN` : exactement la même origine que `PUBLIC_APP_URL`, sans slash final.
- `PAYMENT_PROVIDER=none` tant qu'un prestataire réel n'est pas configuré.
- `TRUST_PROXY=1`.

Ne jamais committer de secrets ou de fichiers `.env`.

## 3. PostgreSQL et migrations

Vercel n'héberge pas la base PostgreSQL dans la fonction. Créer une base PostgreSQL managée (Neon, Supabase ou autre fournisseur), puis renseigner `DATABASE_URL`. Utiliser si possible l'URL poolée/serverless du fournisseur.

Appliquer les migrations une seule fois depuis un environnement de confiance, avec la même URL de base :
```bash
cd backend
npx prisma migrate deploy
```
Ne pas exécuter `prisma migrate dev` en production.

## 4. Stockage des photos

Le backend utilise désormais `@vercel/blob` pour stocker les photos de produits. Dans le projet Vercel :
1. Ouvrir l'onglet Storage.
2. Créer un Blob Store avec accès **Public** (les photos de menu sont destinées aux visiteurs).
3. Connecter le Blob Store à ce projet et aux environnements Preview/Production.
4. Vérifier que `BLOB_READ_WRITE_TOKEN` est ajouté automatiquement aux environnements concernés. Si le store utilise OIDC, Vercel gère l'authentification selon la configuration du store.

La limite applicative reste de 2 Mo par image.

## 5. Temps réel Socket.IO

Vercel Functions prend en charge les WebSockets. Le serveur est exporté depuis `api/[...path].ts`, le chemin Socket.IO est `/api/socket.io`, et les clients utilisent `transports: ['websocket']` (le polling HTTP de Socket.IO n'est pas utilisé sur cette route).

Les connexions peuvent être fermées à la fin de la durée maximale de la fonction : les clients doivent se reconnecter et se réabonner. La fonction est réglée à 300 secondes. Important : les salles Socket.IO de ce projet sont actuellement en mémoire. Avec plusieurs instances Vercel, les événements émis par une instance ne sont pas automatiquement relayés aux sockets d'une autre instance. Pour un temps réel fiable à l'échelle, il faudra ajouter un adaptateur Socket.IO partagé (par exemple Redis/Upstash). En attendant, les écrans de suivi de commande et de caisse conservent leur actualisation HTTP périodique de secours.

## 6. Paiements

Conserver `PAYMENT_PROVIDER=none` jusqu'à l'intégration et aux essais d'un prestataire réel. Les webhooks doivent pointer vers l'URL HTTPS de production et leur signature doit être vérifiée.

## 7. Déploiement et vérification

Après configuration :
1. Déclencher un déploiement Preview.
2. Vérifier `https://<domaine>/api/v1/health` : la réponse attendue contient `{"status":"ok"}`.
3. Vérifier le chargement des routes React, notamment une URL directe telle que `/commande/<id>`.
4. Tester la connexion, la création d'une commande et les mises à jour de menu.
5. Tester l'envoi d'une photo produit et vérifier que l'URL enregistrée pointe vers `*.public.blob.vercel-storage.com`.
6. Tester le suivi d'une commande sur deux appareils. Si les événements temps réel ne sont pas relayés entre instances, l'actualisation HTTP de secours reste disponible jusqu'à l'ajout de l'adaptateur Redis.

Le build et les tests doivent être confirmés par un déploiement Preview Vercel : ils n'ont pas encore été exécutés depuis cet environnement.
