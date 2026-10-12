# TODO — Améliorations et ajouts du portail

Liste établie en se plaçant du côté des utilisateurs réels du portail (direction, enseignants,
élèves, familles, personnel) et en s'inspirant des portails scolaires existants (Pronote,
EcoleDirecte, CampusFlow, Edumarshal, EdFleet...).

Priorités : **P0** = bloquant pour un vrai déploiement · **P1** = attendu par les utilisateurs ·
**P2** = confort / différenciation.

---

## 1. Familles (parents) — le grand manque

Dans tous les portails étudiés, les familles sont le premier public. Aujourd'hui elles n'ont aucun accès.

- [ ] **P0** Comptes « parent » liés à un ou plusieurs élèves (un parent = plusieurs enfants, fratrie regroupée sous une fiche famille).
- [ ] **P0** Rôle « parent » avec permissions dédiées : notes, présences, emploi du temps, messagerie, annonces de leurs enfants uniquement.
- [ ] **P1** Justification d'une absence ou d'un retard par la famille (avec pièce jointe), validée par la vie scolaire.
- [ ] **P1** Choix du parent pour l'ouverture de compte (invitation par e-mail ou code à usage unique, sans mot de passe partagé).
- [ ] **P2** Plusieurs responsables légaux par élève, avec droits de consultation distincts.

## 2. Direction / administration

- [ ] **P0** Tableau de bord d'accueil utile : absences du jour, élèves à risque, messages non lus, tâches en attente (aujourd'hui l'accueil n'affiche que des totaux).
- [ ] **P0** Entité « Classe » réelle (aujourd'hui les classes sont déduites du texte `class_name` des élèves) : niveau, professeur principal, effectif, année scolaire.
- [ ] **P0** Années scolaires et trimestres/périodes gérés en base (les notes et présences doivent être rattachées à une année).
- [ ] **P1** Import en masse CSV (élèves, enseignants, classes) avec aperçu et rapport d'erreurs ligne par ligne.
- [ ] **P1** Export des données (CSV/PDF) depuis chaque liste et chaque rapport.
- [ ] **P1** Journal d'audit consultable (qui a modifié quoi, quand) — les événements existent déjà en base, il manque l'écran.
- [ ] **P1** Validation à deux niveaux pour les actions sensibles (suppression d'élève, changement de note après clôture de trimestre).
- [ ] **P2** Module de frais de scolarité : échéanciers, factures, relances, paiement en ligne (CampusFlow / Edumarshal / EdFleet le proposent).
- [ ] **P2** Gestion des bulletins : génération PDF, appréciations, modèles par niveau.
- [ ] **P2** Gestion du transport (ligne, arrêt, élèves par ligne) — souvent demandé dans les écoles avec bus.

## 3. Enseignants

- [ ] **P0** Restriction de l'enseignant à **ses** classes et **ses** matières (lien enseignant ↔ classe ↔ matière). C'est la limite connue actuelle des permissions « présences » et « notes ».
- [ ] **P0** Saisie des présences rapide sur téléphone : une classe entière en moins de 30 secondes (tout présent par défaut, on ne touche que les absents / retards).
- [ ] **P1** **Cahier de textes** : publier le travail à faire et le contenu du cours par classe et par date ; visible par élèves et familles. C'est une fonctionnalité centrale de Pronote et d'EcoleDirecte, et elle est absente ici.
- [ ] **P1** Calendrier des devoirs et contrôles (publication et conflit avec un autre contrôle de la même classe).
- [ ] **P1** Saisie des notes par évaluation (contrôle, devoir, coefficient), et calcul automatique des moyennes par matière et par trimestre.
- [ ] **P2** Remplacements : signaler une absence de cours et proposer un remplaçant.
- [ ] **P2** Appel par QR code ou appel depuis l'emploi du temps (ouverture directe de la bonne séance).

## 4. Élèves

- [ ] **P1** Page « Aujourd'hui » : cours du jour, devoirs à rendre, contrôles à venir, annonces non lues.
- [ ] **P1** Devoirs et ressources par matière (liste à jour, pièces jointes).
- [ ] **P2** Vue des notes par évaluation avec évolution, en plus de la moyenne.

## 5. Communication et notifications

- [ ] **P0** Notifications dans l'application (cloche avec compteur) : nouvelle note, absence, message, annonce. Aujourd'hui il faut recharger la page.
- [ ] **P1** Notifications par e-mail (absence signalée, note publiée, rappel de paiement).
- [ ] **P1** Annonces ciblées : par classe, par niveau, par rôle, avec accusé de lecture (le modèle le permet déjà en partie).
- [ ] **P1** Messagerie : pièces jointes, réponse dans le fil, recherche dans les messages.
- [ ] **P2** SMS / WhatsApp pour les absences et les urgences (très demandé dans les écoles, cf. EdFleet, Edumarshal).
- [ ] **P2** Préférences de notification par canal et par type d'événement.

## 6. Gestion du staff et permissions (ce qui vient d'être fait, à compléter)

- [ ] **P0** Décider si l'administrateur doit pouvoir désactiver certaines de ses propres fonctionnalités (aujourd'hui ses permissions sont fixes, pour éviter un verrouillage).
- [ ] **P0** Donner une permission « Gérer les emplois du temps » à un rôle par défaut (aujourd'hui personne ne peut modifier l'emploi du temps tant que l'admin ne l'accorde pas).
- [ ] **P1** Vue « Ce que voit ce rôle » : aperçu du menu et des pages accessibles pour un rôle donné.
- [ ] **P1** Ne pas proposer le rôle « Élève » ou « Enseignant » aux comptes du staff (ils ont leur propre écran).
- [ ] **P2** Modèles de rôles prêts à l'emploi (Surveillant, Secrétariat, Intendance, Infirmerie) pour éviter la configuration à zéro.

## 7. Compte, sécurité et conformité

- [ ] **P0** Récupération de compte sans passer par l'admin : codes de secours 2FA (à imprimer une fois), réinitialisation par e-mail.
- [ ] **P0** Gestion des sessions : voir les appareils connectés et fermer une session à distance.
- [ ] **P1** Politique de conservation et d'effacement des données (élèves sortants, RGPD), export des données d'une personne.
- [ ] **P1** Mentions légales et consentement pour les données des mineurs (texte à faire valider par l'établissement).
- [ ] **P2** Connexion par fournisseur d'identité de l'établissement (SSO / Google Workspace / Microsoft 365).

## 8. Expérience utilisateur et accessibilité

- [ ] **P0** Vérifier et corriger l'affichage mobile de toutes les pages (les enseignants et les familles utilisent surtout leur téléphone).
- [ ] **P1** États vides, de chargement et d'erreur soignés sur chaque liste (un message clair au lieu d'une page vide).
- [ ] **P1** Recherche, filtres et pagination sur les grandes listes (élèves, messages, audit).
- [ ] **P1** Accessibilité : navigation au clavier, libellés pour lecteurs d'écran, contrastes en mode sombre.
- [ ] **P1** Cohérence de la langue arabe (sens de lecture RTL sur toutes les pages, y compris les nouvelles).
- [ ] **P2** Application mobile ou PWA installable, avec lecture hors ligne de l'emploi du temps.
- [ ] **P2** Page d'aide intégrée par rôle (« Comment marquer une absence ? »).

## 9. Qualité technique et exploitation

- [ ] **P0** Tests de bout en bout des parcours principaux (connexion, saisie d'une présence, permissions) avec un vrai navigateur.
- [ ] **P0** Sauvegardes automatiques de la base et procédure de restauration documentée.
- [ ] **P1** Intégration continue : lint, tests et build à chaque push.
- [ ] **P1** Journalisation des erreurs serveur et supervision (disponibilité, temps de réponse).
- [ ] **P1** Guide d'installation pour Windows (Docker Desktop ou PostgreSQL natif), testé sur une machine vierge.
- [ ] **P2** Import / export compatible avec les logiciels de vie scolaire existants (migration depuis Pronote ou EcoleDirecte).

## 10. Nettoyage technique repéré pendant la revue

- [ ] **P1** Supprimer les anciennes pages de messagerie par rôle (`admin/messages`, `teacher/messages`, `student/messages`) : elles ne sont plus liées dans le menu et font doublon avec `/dashboard/messages`.
- [ ] **P1** Réglage « double authentification » dans les paramètres : la condition d'affichage repose encore sur le rôle `student` au lieu du réglage du rôle.
- [ ] **P1** Restriction des messages : à confirmer avec la règle métier (un enseignant peut-il écrire à un autre enseignant ?).
- [ ] **P2** Nettoyer les fichiers de l'ancienne base SQLite à la racine du projet (`school.db*`) s'ils ne servent plus.
- [ ] **P2** Ajouter une documentation technique des permissions (catalogue, ajout d'une nouvelle fonctionnalité pas à pas).

---

## Sources d'inspiration

- Pronote et EcoleDirecte : cahier de textes, vie scolaire (absences, retards, sanctions), messagerie, espace famille — [magicmaman](https://www.magicmaman.com/pronote-et-autres-logiciels-de-vie-scolaire-ami-ou-ennemi-des-parents,3676036.asp), [presse-citron](https://www.presse-citron.net/telecharger/loisirs/education_et_scolarite/mon-ecoledirecte.html)
- EcoleDirecte : profils distincts par public, notifications en temps réel — [sitinstit](https://www.sitinstit.net/ecole-directe-plateforme-n-1-de-l-enseignement-numerique.html)
- CampusFlow (tableaux de bord par rôle, pièces, présences en moins de 2 minutes) — [makemyprd](https://www.makemyprd.com/prd/build-a-modern-school-management-app-with-admin-teacher-student-portals--6w5tMM)
- Edumarshal : notifications multicanal, liaison fratrie / familles, transport — [edumarshal](https://edumarshal.com/school-erp-modules/online-school-portal-students-parents/)
- EdFleet : permissions par rôle, validation à deux niveaux, journal d'audit, présence en moins de 30 secondes — [edfleet](https://edfleet.com/blog/school-management-system-features/)
- Greensighter : les familles doivent voir présences, notes, devoirs et messages en moins de 30 secondes — [greensighter](https://www.greensighter.com/blog/school-management-software-development)
