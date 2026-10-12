// npm run db:migrate – creates / updates the database schema. Never inserts data.
import { migrate } from '../lib/migrate.js';
import { getPool } from '../lib/db.js';

try {
    await migrate();
} catch (e) {
    console.error(e.message);
    process.exitCode = 1;
} finally {
    await getPool().end();
}
