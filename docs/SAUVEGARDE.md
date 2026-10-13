# Sauvegarde et restauration de la base

Le portail enregistre toutes ses données dans PostgreSQL. Cette page décrit comment les sauvegarder
et comment les restaurer. Elle s'adresse à la personne qui exploite le portail.

## Ce qui est sauvegardé

`npm run db:backup` écrit un dossier `backups/<date UTC>/` contenant :

- un fichier `<table>.json` par table (toutes les données, y compris l'historique des migrations) ;
- un `manifest.json` avec la date, le nombre de lignes par table et la liste des migrations appliquées.

La sauvegarde est prise dans une seule transaction en lecture seule : elle est cohérente même si le
portail est utilisé pendant l'opération.

> **Important : sauvegardez aussi la clé `APP_ENCRYPTION_KEY`** (fichier `.env.local`) et les codes
> opérateur, **séparément** des sauvegardes (gestionnaire de mots de passe ou coffre papier).
> Les secrets 2FA sont chiffrés avec cette clé : sans elle, une sauvegarde ne permet plus de
> rétablir la double authentification (l'administrateur peut alors la réinitialiser).

Les sauvegardes contiennent des données personnelles d'élèves et de familles : stockez-les sur un
support chiffré et à accès restreint. Le dossier `backups/` est exclu de Git.

## Faire une sauvegarde

```bash
npm run db:backup                 # garde les 14 dernières sauvegardes
npm run db:backup -- --keep 30    # garde les 30 dernières
```

## Planification

Une sauvegarde **chaque nuit** est recommandée.

Linux / macOS (crontab, `crontab -e`) :

```cron
0 2 * * * cd /chemin/vers/First-Web-site && npm run db:backup >> /var/log/portail-backup.log 2>&1
```

Windows (Planificateur de tâches) : créer une tâche quotidienne à 02h00 avec l'action
`cmd /c "cd C:\chemin\First-Web-site && npm run db:backup"`.

Copiez ensuite régulièrement le dossier `backups/` sur un second support (disque externe, autre
serveur). Une sauvegarde qui reste uniquement sur la machine qui a planté ne sert à rien.

## Restaurer

1. Arrêtez le portail (`Ctrl+C` dans le terminal, ou arrêt du service).
2. Vérifiez que `.env.local` contient la **même** `APP_ENCRYPTION_KEY` que lors de la sauvegarde.
3. Choisissez le dossier à restaurer (le plus récent avant l'incident) :
   ```bash
   ls backups/
   ```
4. Lancez la restauration. Elle **remplace toutes les données** et exige `--confirm` :
   ```bash
   npm run db:restore -- backups/20261012T230000Z --confirm
   ```
5. Relancez le portail (`npm start`) et connectez-vous avec un compte administrateur.
6. Vérifiez quelques données (nombre d'élèves, dernières notes, dernières présences).

La restauration se fait dans **une seule transaction** : si une erreur survient, rien n'est modifié.
Elle refuse de s'exécuter si la sauvegarde contient des migrations que la base ne connaît pas
(mettez alors d'abord à jour le code, puis `npm run db:migrate`).

## Vérifier qu'une sauvegarde est bonne

Une fois par trimestre, sur une copie du projet :

```bash
npm run db:restore -- backups/<dossier> --confirm
```

puis contrôlez les compteurs affichés par `manifest.json`. Pour un essai sans rien modifier, les tests
automatisés (`npm test`, fichier `tests/backup.test.js`) chargent une sauvegarde puis annulent la
transaction.

## Limites

- Il s'agit d'une sauvegarde logique (JSON), faite par l'application. Elle ne remplace pas une
  sauvegarde disque complète (snapshot de la machine ou de la base managée) si celle-ci est disponible.
- Les fichiers téléversés (avatars) ne sont pas dans la base : ils ne sont pas inclus.
