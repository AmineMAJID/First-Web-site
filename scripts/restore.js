// npm run db:restore -- backups/<folder> --confirm
// Replaces ALL data of the database with the backup. Refuses to run without --confirm.
// Stop the application first (npm start) so nobody writes during the restore.
import { getPool } from '../lib/db.js';
import { migrate } from '../lib/migrate.js';
import { restoreBackup } from '../lib/backup.js';
import { runCli } from '../lib/cli.js';

await runCli(async () => {
    const dir = process.argv.slice(2).find((a) => !a.startsWith('--'));
    if (!dir) throw new Error('Usage: npm run db:restore -- backups/<folder> --confirm');
    if (!process.argv.includes('--confirm')) throw new Error('This replaces all data. Add --confirm to proceed.');
    await migrate(() => {});
    const { manifest } = await restoreBackup(dir, { log: (m) => console.log(m) });
    console.log(`Restored from ${manifest.createdAt} (${manifest.migrations.length} migrations).`);
}, async () => { await getPool().end(); });
