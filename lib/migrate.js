// Applies the SQL files in db/migrations in order. Each file runs once, in a transaction.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');
const LOCK_KEY = 874213;

export async function migrate(log = console.log) {
    const client = await getPool().connect();
    try {
        // Prevent two processes from migrating at the same time
        await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
        await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
        const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
        const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

        let count = 0;
        for (const file of files) {
            if (applied.has(file)) continue;
            const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
                await client.query('COMMIT');
                log(`Applied migration ${file}`);
                count++;
            } catch (e) {
                await client.query('ROLLBACK');
                throw new Error(`Migration ${file} failed: ${e.message}`);
            }
        }
        if (count === 0) log('Database is up to date.');
        return count;
    } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
        client.release();
    }
}
