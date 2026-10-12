// npm run codes:generate [-- --force]
// Generates the two operator codes (18 characters each, always different from each other),
// stores only their argon2 hashes in .env.local, and prints the plain codes ONCE.
//   - creation code: for `npm run admin:create`
//   - management code: for `npm run admin:reset-password` and `npm run admin:reset-2fa`
// Keep the printed codes in a password manager. They cannot be shown again.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateCode } from '../lib/codes.js';
import { hashPassword } from '../lib/password.js';
import { requireTerminal, runCli } from '../lib/cli.js';

const ENV_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
const KEYS = ['ADMIN_CREATE_CODE_HASH', 'ADMIN_MANAGE_CODE_HASH'];

await runCli(async () => {
    requireTerminal();
    const force = process.argv.includes('--force');
    const current = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
    if (KEYS.some((k) => new RegExp(`^${k}=`, 'm').test(current)) && !force) {
        throw new Error('Codes already exist. Re-running this replaces them: use "npm run codes:generate -- --force" (the old codes stop working).');
    }

    const createCode = generateCode();
    let manageCode = generateCode();
    while (manageCode === createCode) manageCode = generateCode();

    const kept = current.split('\n').filter((line) => !KEYS.some((k) => line.startsWith(`${k}=`)));
    while (kept.length && kept[kept.length - 1] === '') kept.pop();
    kept.push(
        `ADMIN_CREATE_CODE_HASH='${await hashPassword(createCode)}'`,
        `ADMIN_MANAGE_CODE_HASH='${await hashPassword(manageCode)}'`,
    );
    fs.writeFileSync(ENV_FILE, kept.join('\n') + '\n', { mode: 0o600 });

    console.log('\nNew operator codes (shown once, store them in a password manager):\n');
    console.log(`  Creation code   : ${createCode}`);
    console.log(`  Management code : ${manageCode}`);
    console.log('\nHashes saved in .env.local. Use them as: npm run admin:create -- --code "<creation code>"');
}, async () => {});
