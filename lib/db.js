// PostgreSQL access layer (node-postgres). Schema lives in db/migrations/*.sql.
//
// API (all async):
//   db.get(sql, params)  -> first row or undefined
//   db.all(sql, params)  -> array of rows
//   db.run(sql, params)  -> { rowCount, rows }
//   tx(async (t) => ...) -> runs the callback in a transaction (t has the same API)
//
// SQL uses `?` placeholders for readability; they are converted to $1, $2, ...
import pg from 'pg';

const { Pool, types } = pg;

// BIGINT (ids, COUNT) and NUMERIC (averages) come back as numbers, not strings.
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));

let pool;

export function getPool() {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and adjust it.');
        }
        pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
        pool.on('error', (e) => console.error('[db] idle client error:', e.message));
    }
    return pool;
}

const toPg = (sql) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
};
// pg rejects `undefined`; normalise it to NULL.
const clean = (params) => params.map((p) => (p === undefined ? null : p));

function api(runner) {
    const query = (sql, params = []) => runner.query(toPg(sql), clean(params));
    return {
        async get(sql, params) {
            return (await query(sql, params)).rows[0];
        },
        async all(sql, params) {
            return (await query(sql, params)).rows;
        },
        async run(sql, params) {
            const r = await query(sql, params);
            return { rowCount: r.rowCount ?? 0, rows: r.rows };
        },
    };
}

export const db = {
    get: (sql, params) => api(getPool()).get(sql, params),
    all: (sql, params) => api(getPool()).all(sql, params),
    run: (sql, params) => api(getPool()).run(sql, params),
};

export async function tx(fn) {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await fn(api(client));
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
}
