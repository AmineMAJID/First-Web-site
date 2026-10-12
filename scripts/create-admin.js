// npm run admin:create [-- --additional]
//
// Creates an administrator account. Security layers:
//   1. Command-line only: it needs a real terminal on the server (no HTTP endpoint exists for it).
//   2. The password is typed twice, hidden, and must pass the password policy.
//   3. Refuses to run when an admin already exists, unless --additional is given explicitly.
//   4. The account has no 2FA yet: the admin must enrol an authenticator app at first login,
//      and cannot open any session without it.
//   5. The creation is recorded in the audit log (auth_events).
import readline from 'readline';
import { db, getPool } from '../lib/db.js';
import { migrate } from '../lib/migrate.js';
import { hashPassword, checkPasswordPolicy } from '../lib/password.js';
import { recordEvent } from '../lib/security.js';

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

function ask(rl, question, { hidden = false } = {}) {
    return new Promise((resolve) => {
        if (!hidden) return rl.question(question, (a) => resolve(a));
        // Mute echo while typing the password
        const write = rl._writeToOutput;
        rl._writeToOutput = (s) => { if (s.includes(question)) write.call(rl, s); };
        rl.question(question, (answer) => {
            rl._writeToOutput = write;
            process.stdout.write('\n');
            resolve(answer);
        });
    });
}

async function main() {
    if (!process.stdin.isTTY) {
        throw new Error('This command must be run from an interactive terminal (passwords are never accepted as arguments).');
    }
    const additional = process.argv.includes('--additional');

    await migrate(() => {});
    const existing = await db.get("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'");
    if (existing.c > 0 && !additional) {
        throw new Error('An administrator already exists. Use "npm run admin:create -- --additional" to add another one.');
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    try {
        console.log(existing.c > 0 ? 'Creating an ADDITIONAL administrator.' : 'Creating the first administrator.');

        const username = (await ask(rl, 'Username (3-32 chars: a-z, 0-9, . _ -): ')).trim().toLowerCase();
        if (!USERNAME_RE.test(username)) throw new Error('Invalid username.');
        if (await db.get('SELECT 1 FROM users WHERE username = ?', [username])) throw new Error('This username is already taken.');

        const fullName = (await ask(rl, 'Full name: ')).trim();
        if (!fullName || fullName.length > 100) throw new Error('Full name is required (max 100 characters).');

        const email = (await ask(rl, 'Email (optional): ')).trim() || null;

        const password = await ask(rl, 'Password (hidden): ', { hidden: true });
        const policy = checkPasswordPolicy(password, username);
        if (policy) throw new Error(policy);
        const confirm = await ask(rl, 'Confirm password (hidden): ', { hidden: true });
        if (password !== confirm) throw new Error('Passwords do not match.');

        const hash = await hashPassword(password);
        const row = await db.get(
            `INSERT INTO users (username, password_hash, role, full_name, email, must_change_password)
             VALUES (?, ?, 'admin', ?, ?, FALSE) RETURNING id`,
            [username, hash, fullName, email],
        );
        await recordEvent('admin_created', { username, userId: row.id });

        console.log(`\nAdministrator "${username}" created.`);
        console.log('Next: start the app, sign in, and scan the 2FA QR code with your authenticator app.');
    } finally {
        rl.close();
    }
}

try {
    await main();
} catch (e) {
    console.error(`\nError: ${e.message}`);
    process.exitCode = 1;
} finally {
    await getPool().end();
}
