// npm run admin:create -- --code "<creation code>"
//
// Creates THE administrator account. Only one admin can ever exist (database constraint).
// Security layers:
//   1. Command-line only, on a real terminal (no HTTP endpoint exists for it).
//   2. The 18-character creation code is required and checked against its hash.
//   3. Refuses when an administrator already exists.
//   4. The password is typed twice, hidden, and must pass the password policy.
//   5. No 2FA yet: the admin enrols an authenticator app at first login; no session before that.
//   6. Every attempt (success or failure) is written to the audit log.
import { db, getPool } from '../lib/db.js';
import { migrate } from '../lib/migrate.js';
import { hashPassword, checkPasswordPolicy } from '../lib/password.js';
import { checkCodeFormat, codeMatches } from '../lib/codes.js';
import { recordEvent } from '../lib/security.js';
import { argValue, requireTerminal, openPrompt, ask, askHidden, sleep, runCli } from '../lib/cli.js';

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

await runCli(async () => {
    requireTerminal();
    const code = argValue('code');
    if (!code) throw new Error('Missing --code. Usage: npm run admin:create -- --code "<18-character creation code>"');
    const formatError = checkCodeFormat(code);
    if (formatError) throw new Error(formatError);

    await migrate(() => {});

    if (!(await codeMatches('ADMIN_CREATE_CODE_HASH', code))) {
        await recordEvent('admin_create_bad_code');
        await sleep(2000); // slows down guessing
        throw new Error('Invalid creation code.');
    }

    const existing = await db.get("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'");
    if (existing.c > 0) {
        await recordEvent('admin_create_refused_exists');
        throw new Error('An administrator already exists. Only one administrator account is allowed.');
    }

    const rl = openPrompt();
    try {
        console.log('Creating the administrator account.');
        const username = (await ask(rl, 'Username (3-32 chars: a-z, 0-9, . _ -): ')).trim().toLowerCase();
        if (!USERNAME_RE.test(username)) throw new Error('Invalid username.');

        const fullName = (await ask(rl, 'Full name: ')).trim();
        if (!fullName || fullName.length > 100) throw new Error('Full name is required (max 100 characters).');

        const email = (await ask(rl, 'Email (optional): ')).trim() || null;

        const password = await askHidden(rl, 'Password (hidden): ');
        const policy = checkPasswordPolicy(password, username);
        if (policy) throw new Error(policy);
        const confirm = await askHidden(rl, 'Confirm password (hidden): ');
        if (password !== confirm) throw new Error('Passwords do not match.');

        try {
            const row = await db.get(
                `INSERT INTO users (username, password_hash, role, full_name, email, must_change_password)
                 VALUES (?, ?, 'admin', ?, ?, FALSE) RETURNING id`,
                [username, await hashPassword(password), fullName, email],
            );
            await recordEvent('admin_created', { username, userId: row.id });
        } catch (e) {
            if (e.code === '23505') throw new Error('This username is taken, or an administrator was just created.');
            throw e;
        }

        console.log(`\nAdministrator "${username}" created.`);
        console.log('Next: start the app, sign in, and scan the 2FA QR code with your authenticator app.');
    } finally {
        rl.close();
    }
}, () => getPool().end());
