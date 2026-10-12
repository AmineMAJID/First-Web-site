// npm run admin:reset-password -- <username> --code "<management code>"
// Sets a new password for any account (admin included) and signs that account out everywhere.
// The new password is typed hidden, twice, and must pass the password policy.
import { db, getPool } from '../lib/db.js';
import { migrate } from '../lib/migrate.js';
import { hashPassword, checkPasswordPolicy } from '../lib/password.js';
import { checkCodeFormat, codeMatches } from '../lib/codes.js';
import { revokeUserSessions } from '../lib/session.js';
import { recordEvent } from '../lib/security.js';
import { argValue, requireTerminal, openPrompt, askHidden, sleep, runCli } from '../lib/cli.js';

const username = (process.argv[2] || '').trim().toLowerCase();

await runCli(async () => {
    requireTerminal();
    if (!username || username.startsWith('--')) throw new Error('Usage: npm run admin:reset-password -- <username> --code "<management code>"');
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

    const user = await db.get('SELECT id, role FROM users WHERE username = ?', [username]);
    if (!user) throw new Error(`No user named "${username}".`);

    const rl = openPrompt();
    try {
        const password = await askHidden(rl, 'New password (hidden): ');
        const policy = checkPasswordPolicy(password, username);
        if (policy) throw new Error(policy);
        const confirm = await askHidden(rl, 'Confirm new password (hidden): ');
        if (password !== confirm) throw new Error('Passwords do not match.');

        await db.run(
            'UPDATE users SET password_hash = ?, must_change_password = FALSE, password_changed_at = now(), updated_at = now() WHERE id = ?',
            [await hashPassword(password), user.id],
        );
    } finally {
        rl.close();
    }
    await revokeUserSessions(user.id);
    await recordEvent('password_reset_by_cli', { username, userId: user.id });
    console.log(`Password changed for "${username}". All their sessions were closed.`);
}, () => getPool().end());
