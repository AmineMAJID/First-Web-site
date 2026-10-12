// npm run admin:reset-2fa -- <username>
// Recovery for a lost phone / authenticator: removes the enrolled 2FA secret and signs the
// user out everywhere. The user then enrols a new authenticator at next login.
// Requires shell access to the server (same trust level as the database itself).
import { db, getPool } from '../lib/db.js';
import { migrate } from '../lib/migrate.js';
import { revokeUserSessions } from '../lib/session.js';
import { recordEvent } from '../lib/security.js';

try {
    const username = String(process.argv[2] || '').trim().toLowerCase();
    if (!username) throw new Error('Usage: npm run admin:reset-2fa -- <username>');
    await migrate(() => {});
    const user = await db.get('SELECT id, role FROM users WHERE username = ?', [username]);
    if (!user) throw new Error(`No user named "${username}".`);
    await db.run('UPDATE users SET two_factor_secret = NULL, two_factor_last_step = NULL, updated_at = now() WHERE id = ?', [user.id]);
    await revokeUserSessions(user.id);
    await recordEvent('2fa_reset_by_cli', { username, userId: user.id });
    console.log(`2FA reset for "${username}". All their sessions were closed.`);
} catch (e) {
    console.error(`Error: ${e.message}`);
    process.exitCode = 1;
} finally {
    await getPool().end();
}
