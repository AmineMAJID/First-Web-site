// Application-level backup and restore of the whole database, as JSON files (one per table).
// A backup is a folder: manifest.json + <table>.json. It works with any PostgreSQL the app runs on.
//
// IMPORTANT: 2FA secrets are stored encrypted with APP_ENCRYPTION_KEY. Keep that key with the backups
// (separately, in a password manager): without it, the secrets in a backup cannot be read.
import fs from 'fs';
import path from 'path';
import { getPool } from './db.js';

const NEVER_RESTORED = new Set(['schema_migrations']);   // the migration history is kept as it is in the target

export async function listTables(client) {
    const { rows } = await client.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
    return rows.map((r) => r.tablename);
}

// Writes a consistent snapshot (one REPEATABLE READ read-only transaction) into `dir`
export async function writeBackup(dir) {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const tables = await listTables(client);
        const counts = {};
        fs.mkdirSync(dir, { recursive: true });
        for (const t of tables) {
            const { rows } = await client.query(`SELECT * FROM "${t}" ORDER BY 1`);
            counts[t] = rows.length;
            fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(rows));
        }
        const migrations = (await client.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map((r) => r.name);
        await client.query('COMMIT');
        const manifest = { format: 1, createdAt: new Date().toISOString(), migrations, tables: counts };
        fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
        return manifest;
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
}

// Tables ordered so that a table comes after the tables it references (foreign keys)
export async function restoreOrder(client, tables) {
    const { rows } = await client.query(`
        SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
        FROM pg_constraint c
        WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace`);
    const deps = new Map(tables.map((t) => [t, new Set()]));
    for (const r of rows) {
        const child = r.child.replace(/"/g, '');
        const parent = r.parent.replace(/"/g, '');
        if (child !== parent && deps.has(child) && deps.has(parent)) deps.get(child).add(parent);
    }
    const ordered = [];
    const done = new Set();
    while (ordered.length < tables.length) {
        const ready = tables.filter((t) => !done.has(t) && [...deps.get(t)].every((p) => done.has(p)));
        if (!ready.length) throw new Error('Circular foreign keys between tables: ' + tables.filter((t) => !done.has(t)).join(', '));
        for (const t of ready) { ordered.push(t); done.add(t); }
    }
    return ordered;
}

// Replaces the data of every table with the content of `dir`, in one transaction.
// With { rollback: true } the transaction is rolled back at the end (a dry run that checks the backup loads).
export async function restoreBackup(dir, { rollback = false, log = () => {} } = {}) {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    if (manifest.format !== 1) throw new Error('Unknown backup format');
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const applied = (await client.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map((r) => r.name);
        const unknown = manifest.migrations.filter((m) => !applied.includes(m));
        if (unknown.length) throw new Error(`The backup needs migrations this database does not have: ${unknown.join(', ')}. Run npm run db:migrate with the matching code first.`);

        const tables = (await listTables(client)).filter((t) => !NEVER_RESTORED.has(t));
        const order = await restoreOrder(client, tables);
        await client.query(`TRUNCATE ${order.map((t) => `"${t}"`).join(', ')}`);

        for (const t of order) {
            const file = path.join(dir, `${t}.json`);
            if (!fs.existsSync(file)) { log(`  ${t}: not in backup, left empty`); continue; }
            const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
            for (const row of rows) {
                const cols = Object.keys(row);
                if (!cols.length) continue;
                await client.query(
                    `INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
                    cols.map((c) => row[c]),
                );
            }
            log(`  ${t}: ${rows.length} row(s)`);
            // Keep identity sequences ahead of the restored ids
            const hasId = (await client.query(
                "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'id'", [t])).rowCount > 0;
            if (hasId) {
                const seq = (await client.query(`SELECT pg_get_serial_sequence('"${t}"', 'id') AS s`)).rows[0].s;
                if (seq) await client.query(`SELECT setval('${seq}', COALESCE((SELECT MAX(id) FROM "${t}"), 1), (SELECT MAX(id) FROM "${t}") IS NOT NULL)`);
            }
        }

        if (rollback) {
            await client.query('ROLLBACK');
        } else {
            await client.query('COMMIT');
        }
        return { manifest, restored: order };
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
}

// Keeps the newest `keep` backup folders in `root` (folders are named by their UTC timestamp)
export function pruneBackups(root, keep) {
    if (!fs.existsSync(root)) return [];
    const dirs = fs.readdirSync(root)
        .filter((d) => /^\d{8}T\d{6}Z$/.test(d) && fs.statSync(path.join(root, d)).isDirectory())
        .sort();
    const removed = [];
    for (const d of dirs.slice(0, Math.max(0, dirs.length - keep))) {
        fs.rmSync(path.join(root, d), { recursive: true, force: true });
        removed.push(d);
    }
    return removed;
}

export const stampNow = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
