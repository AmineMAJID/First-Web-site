# 🎓 Student Portal

Portail scolaire (administration, enseignants, élèves) construit avec **Next.js 16**, **React 19** et **PostgreSQL**.

## ✨ Fonctionnalités

| Rôle | Fonctionnalités |
|------|-----------------|
| **Admin** | Tableau de bord & rapports (tendances de présence, répartition des notes, top / élèves à risque), gestion des élèves & enseignants (création avec mot de passe temporaire, réinitialisation mot de passe / 2FA, export CSV), **gestion des emplois du temps** (détection de conflits), messagerie (annonces, envoi par classe / destinataires multiples, accusés de lecture) |
| **Enseignant** | Carnet de notes par matière / trimestre / classe avec remarques, saisie de présence par jour avec historique, emploi du temps personnel, messagerie vers élèves |
| **Élève** | Notes par trimestre avec évolution, calendrier de présence, emploi du temps, messagerie |
| **Tous** | 3 langues (FR / EN / AR avec RTL), thème sombre, page Paramètres (changement de mot de passe), responsive mobile |

### 🔐 Sécurité de la connexion

- **Aucun compte de démonstration** : le premier administrateur est créé avec une commande dédiée (voir ci-dessous).
- **Mots de passe** hachés avec **argon2id** (jamais stockés en clair). Politique : 12 caractères minimum, majuscule, minuscule, chiffre, pas de mot courant ni le nom d'utilisateur.
- **2FA TOTP obligatoire** pour admins et enseignants (Google Authenticator, Authy…). Le secret est généré sur le serveur, **chiffré en base** (AES-256-GCM), et un code ne peut être utilisé **qu'une seule fois** (anti-rejeu).
- **Sessions côté serveur** : le navigateur ne reçoit qu'un jeton aléatoire dans un cookie `httpOnly` ; seul son hachage SHA-256 est en base. Expiration absolue (8 h) et inactivité (60 min). Déconnexion, changement de mot de passe, réinitialisation ou reset 2FA **révoquent les sessions**.
- **Anti-bruteforce** : verrouillage d'un compte après 5 échecs en 15 min ; réponses identiques pour un utilisateur inconnu ou un mauvais mot de passe ; limitation par IP si l'app est derrière un proxy (`TRUST_PROXY`).
- **Protection CSRF** : les requêtes modifiantes venant d'une autre origine sont refusées.
- **Journal d'audit** (`auth_events`) : connexions, échecs, 2FA, déconnexions, changements de mot de passe, créations / resets d'admin.
- En-têtes de sécurité (`nosniff`, `Referrer-Policy`, `Permissions-Policy`), réponses API non cachables.

## 🚀 Démarrage en local

Prérequis : **Node.js ≥ 22.9** et **PostgreSQL 14+** (ou Docker).

```bash
# 1. Installer les dépendances
npm install

# 2. Démarrer PostgreSQL (avec Docker)
docker compose up -d
#    ou utilisez votre propre serveur et adaptez DATABASE_URL

# 3. Configurer l'environnement
cp .env.example .env.local
#    puis générer la clé de chiffrement et la coller dans APP_ENCRYPTION_KEY :
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 4. Créer le schéma de la base (ne crée aucune donnée)
npm run db:migrate

# 5. Créer le premier administrateur (interactif, mot de passe masqué)
npm run admin:create

# 6. Lancer l'application
npm run dev
```

Ouvrez http://localhost:3000 et connectez-vous avec le compte admin créé à l'étape 5.
Au premier login, un QR code s'affiche : scannez-le avec votre application d'authentification. Les connexions suivantes demandent le code à 6 chiffres.

### Créer un administrateur supplémentaire

```bash
npm run admin:create -- --additional
```

### Récupération : téléphone perdu (reset du 2FA)

```bash
npm run admin:reset-2fa -- <nom_utilisateur>
```

Cela supprime le 2FA de ce compte, ferme toutes ses sessions, et le compte devra enrôler un nouvel authentificateur à sa prochaine connexion. Cette commande nécessite un accès shell au serveur.

### Comptes créés par l'admin

Les élèves et enseignants sont créés depuis l'interface admin avec un **mot de passe temporaire** affiché une seule fois. Il doit être changé à la première connexion.

## 🧰 Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm start` | Build et serveur de production |
| `npm run db:migrate` | Applique les migrations SQL (`db/migrations/`) |
| `npm run admin:create` | Crée un administrateur (interactif) |
| `npm run admin:reset-2fa -- <user>` | Réinitialise le 2FA d'un compte |
| `npm test` | Tests end-to-end (nécessite un serveur lancé, voir ci-dessous) |
| `npm run lint` | ESLint |

### Lancer les tests

Les tests utilisent un vrai serveur et un vrai administrateur (créé avec `npm run admin:create`, 2FA déjà enrôlé) :

```bash
TEST_ADMIN_USERNAME=mon.admin \
TEST_ADMIN_PASSWORD='mon-mot-de-passe' \
TEST_ADMIN_TOTP_SECRET='SECRET_BASE32_DU_2FA' \
npm test
```

Le serveur doit tourner sur `BASE_URL` (par défaut `http://localhost:3000`). Un code 2FA ne peut être utilisé qu'une fois par fenêtre de 30 s : les tests attendent automatiquement la fenêtre suivante si nécessaire. Si vous voyez « Too many invalid codes », attendez 5 minutes (protection anti-bruteforce).

## ⚙️ Variables d'environnement

Voir [`.env.example`](.env.example) :

| Variable | Rôle |
|----------|------|
| `DATABASE_URL` | Connexion PostgreSQL |
| `APP_ENCRYPTION_KEY` | Clé de chiffrement des secrets 2FA (32 octets, base64). **Obligatoire, à sauvegarder** |
| `SESSION_HOURS`, `SESSION_IDLE_MINUTES` | Durées de session |
| `COOKIE_SECURE` | `true` en HTTPS en production |
| `TRUST_PROXY` | `true` seulement derrière votre propre reverse proxy |

> ⚠️ Ne committez jamais `.env.local`. Si `APP_ENCRYPTION_KEY` est perdue, les secrets 2FA enregistrés ne peuvent plus être lus (il faudra alors faire un reset 2FA).

## 🗂️ Structure

```
app/
  api/            Routes API (auth, students, teachers, grades, attendance, messages, schedule, reports, classes)
  dashboard/      Pages par rôle (admin / teacher / student) + settings partagé
  login/          Connexion + 2FA
components/       Toast, Modal, ConfirmDialog, Timetable, Messaging
db/migrations/    Schéma SQL PostgreSQL (versionné)
lib/
  db.js           Pool PostgreSQL et helpers (get / all / run / tx)
  migrate.js      Application des migrations
  auth.js         Cookies et identité
  session.js      Sessions serveur (création, validation, révocation)
  password.js     Hachage argon2id et politique de mot de passe
  totp.js         TOTP RFC 6238 (anti-rejeu)
  crypto.js       Chiffrement AES-256-GCM des secrets
  security.js     Audit et limitation des tentatives
  api.js          Helpers pour les routes (requireRole, validation…)
  i18n/           Traductions fr / en / ar
proxy.js          Authentification, contrôle d'accès par rôle, protection CSRF
scripts/          migrate, create-admin, reset-2fa
tests/            Tests end-to-end (node:test)
```
