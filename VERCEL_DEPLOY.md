# Déploiement Fastfood sur Vercel

Le dépôt est configuré comme un monorepo déployé dans **un seul projet Vercel** :
- React/Vite est compilé dans `frontend/dist`.
- Express est exposé comme fonction serverless via `api/[...path].ts`.
- Les appels existants vers `/api/v1/...` restent sur le même domaine.
- Les routes React sont renvoyées vers `index.html`.

## Configuration du projet Vercel

Importer `paulinkabore/fastfood` dans Vercel et conserver la racine du dépôt (ne pas choisir `frontend` ni `backend` comme Root Directory). Les commandes et le dossier de sortie sont déjà définis dans `vercel.json`.

## Variables d'environnement à définir dans Vercel

Définir au minimum :
- `NODE_ENV=production`
- `DATABASE_URL` : URL de connexion PostgreSQL accessible depuis Vercel.
- `JWT_ACCESS_SECRET` : secret aléatoire long d'au moins 32 caractères.
- `PUBLIC_APP_URL` : URL HTTPS réelle du projet Vercel.
- `CORS_ORIGIN` : même origine HTTPS que `PUBLIC_APP_URL`.
- `PAYMENT_PROVIDER=none` tant qu'un prestataire de paiement réel n'est pas configuré.
- `TRUST_PROXY=1`

Ne jamais committer les secrets ou un fichier `.env`.

## Base de données

Vercel Functions ne fournissent pas de serveur PostgreSQL persistant. Il faut une base PostgreSQL hébergée (par exemple Neon ou une base PostgreSQL managée), puis renseigner son URL dans `DATABASE_URL`.

Après avoir configuré la base, appliquer les migrations une fois depuis un environnement de confiance avec les variables d'environnement de production :
```bash
cd backend
npx prisma migrate deploy
```

Ne pas lancer `prisma migrate dev` en production.

## Limites fonctionnelles à traiter avant une mise en production réelle

1. **Photos des produits** : le code actuel écrit dans le système de fichiers local (`uploads/`). Le disque d'une fonction Vercel est éphémère ; les photos doivent être migrées vers un stockage objet persistant (Vercel Blob ou équivalent) avant d'utiliser durablement l'upload d'images.
2. **Socket.IO** : les fonctions Vercel ne gardent pas un serveur WebSocket permanent. Le suivi de commande a déjà une actualisation HTTP de secours toutes les 30 secondes et les commandes caisse ont un polling périodique, mais les notifications instantanées Socket.IO ne fonctionneront pas dans ce déploiement. Pour les restaurer, utiliser un service temps réel externe (par exemple Ably ou Pusher) ou renforcer le polling.
3. **Paiements** : garder `PAYMENT_PROVIDER=none` jusqu'à ce qu'un prestataire réel et ses webhooks HTTPS soient configurés et testés.

Ce dépôt peut ainsi être construit et déployé sur Vercel en un seul projet, mais ces limites doivent être résolues avant de considérer toutes les fonctions comme opérationnelles en production.
