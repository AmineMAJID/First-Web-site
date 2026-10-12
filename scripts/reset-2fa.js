// npm run admin:reset-2fa -- <username> --code "<management code>"
// Removes the enrolled 2FA secret and signs the user out everywhere. At the next login the
// user enrols a new authenticator. Used when a phone is lost.
import { db, getPool } from '../lib/db.js';
import { migrate } from '../lib/migrate.js';
import { checkCodeFormat, codeMatches } from '../lib/codes.js';
import { revokeUserSessions } from '../lib/session.js';
import { recordEvent } from '../lib/security.js';
import { argValue, requireTerminal, sleep, runCli } from '../lib/cli.js';

const username = (process.argv[2] || '').trim().toLowerCase();

await runCli(async () => {
    requireTerminal();
    if (!username || username.startsWith('--')) throw new Error('Usage: npm run admin:reset-2fa -- <username> --code "<management code>"');
    const code = argValue('code');
    if (!code) throw new Error('Missing --code <management code>.');
    const formatError = checkCodeFormat(code);
    if (formatError) throw new Error(formatError);

    await migrate(() => {});
    if (!(await codeMatches('ADMIN_MANAGE_CODE_HASH', code))) {
        await recordEvent('manage_bad_code', { username });
        await sleep(2000);
        throw new Error('Invalid management code.');
    }

    const user = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (!user) throw new Error(`No user named "${username}".`);
    await db.run('UPDATE users SET two_factor_secret = NULL, two_factor_last_step = NULL, updated_at = now() WHERE id = ?', [user.id]);
    await revokeUserSessions(user.id);
    await recordEvent('2fa_reset_by_cli', { username, userId: user.id });
    console.log(`2FA reset for "${username}". All their sessions were closed.`);
}, () => getPool().end());
