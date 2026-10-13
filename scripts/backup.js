// npm run db:backup [-- --keep 14]
// Writes a full snapshot to backups/<UTC timestamp>/ and keeps the newest N snapshots.
// See docs/SAUVEGARDE.md for the schedule and the restore procedure.
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../lib/db.js';
import { writeBackup, pruneBackups, stampNow } from '../lib/backup.js';
import { argValue, runCli } from '../lib/cli.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backups');

await runCli(async () => {
    const keep = Number(argValue('keep') ?? 14);
    if (!Number.isInteger(keep) || keep < 1) throw new Error('--keep must be a positive integer');
    const name = stampNow();
    const dir = path.join(ROOT, name);
    const manifest = await writeBackup(dir);
    const removed = pruneBackups(ROOT, keep);
    const total = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
    console.log(`Backup written: ${dir}`);
    console.log(`  ${Object.keys(manifest.tables).length} tables, ${total} rows, ${manifest.migrations.length} migrations`);
    if (removed.length) console.log(`  removed old backups: ${removed.join(', ')}`);
}, async () => { await getPool().end(); });
