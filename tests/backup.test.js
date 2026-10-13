// Backup and restore (database level, no HTTP). Uses a temporary folder, never the real backups/.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getPool } from '../lib/db.js';
import { writeBackup, restoreBackup, restoreOrder, listTables, pruneBackups } from '../lib/backup.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-backup-test-'));
after(async () => { fs.rmSync(tmp, { recursive: true, force: true }); await getPool().end(); });

const countRows = async (t) => (await getPool().query(`SELECT COUNT(*)::int AS n FROM "${t}"`)).rows[0].n;

test('a backup writes one JSON file per table and a manifest with the counts', async () => {
    const dir = path.join(tmp, 'snap');
    const manifest = await writeBackup(dir);
    const tables = await listTables(await getPool().connect().then((c) => { c.release(); return getPool(); }));
    assert.ok(fs.existsSync(path.join(dir, 'manifest.json')));
    for (const t of tables) assert.ok(fs.existsSync(path.join(dir, `${t}.json`)), `${t}.json written`);
    assert.equal(manifest.tables.users, await countRows('users'));
    assert.ok(manifest.migrations.includes('008_recovery_codes.sql'), 'migrations recorded');
});

test('foreign-key order: parents are restored before the tables that reference them', async () => {
    const client = await getPool().connect();
    try {
        const tables = await listTables(client);
        const order = await restoreOrder(client, tables);
        assert.equal(order.length, tables.length);
        const pos = (t) => order.indexOf(t);
        assert.ok(pos('users') < pos('students'));
        assert.ok(pos('students') < pos('grades'));
        assert.ok(pos('classes') < pos('students'));
        assert.ok(pos('school_years') < pos('classes'));
        assert.ok(pos('users') < pos('notifications'));
    } finally {
        client.release();
    }
});

test('a restore loads the backup; a dry run (rollback) leaves the database untouched', async () => {
    const dir = path.join(tmp, 'restore');
    await writeBackup(dir);
    const before = { users: await countRows('users'), grades: await countRows('grades'), notifications: await countRows('notifications') };

    const result = await restoreBackup(dir, { rollback: true });
    assert.ok(result.restored.length > 10);

    // Rolled back: same data as before the dry run
    assert.equal(await countRows('users'), before.users);
    assert.equal(await countRows('grades'), before.grades);
    assert.equal(await countRows('notifications'), before.notifications);
});

test('a backup needing a migration this database does not have is refused', async () => {
    const dir = path.join(tmp, 'future');
    await writeBackup(dir);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    manifest.migrations.push('999_future.sql');
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(restoreBackup(dir, { rollback: true }), /needs migrations this database does not have/);
});

test('retention keeps the newest backups only', () => {
    const root = path.join(tmp, 'retention');
    for (const d of ['20260101T000000Z', '20260102T000000Z', '20260103T000000Z', 'not-a-backup']) {
        fs.mkdirSync(path.join(root, d), { recursive: true });
    }
    const removed = pruneBackups(root, 2);
    assert.deepEqual(removed, ['20260101T000000Z']);
    assert.ok(fs.existsSync(path.join(root, 'not-a-backup')), 'unrelated folders are never touched');
    assert.ok(fs.existsSync(path.join(root, '20260103T000000Z')));
});
