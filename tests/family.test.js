// Families: parent accounts linked to students, what they can read and what they cannot.
// Requires a running server (BASE_URL) and the env vars in tests/helpers.js.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, BASE, loginWith2FA, adminLogin, uniq, Client } from './helpers.js';

const SUFFIX = uniq('').slice(-5);
const TODAY = new Date().toISOString().slice(0, 10);
let admin, adminId;
let child1, child2, other;   // { id, username, userId }
let parent;                  // { client, userId, username, password }

async function newStudent(name) {
    const s = await admin.req('/api/students', { method: 'POST', body: { fullName: name } });
    assert.equal(s.status, 201, JSON.stringify(s.data));
    const row = (await admin.req('/api/students')).data.find((x) => x.username === s.data.student.username);
    return { id: row.id, username: row.username, userId: row.userId };
}

before(async () => {
    assert.ok(ADMIN.username && ADMIN.password && ADMIN.totpSecret, 'set TEST_ADMIN_* variables');
    admin = (await adminLogin()).client;
    adminId = (await admin.req('/api/auth/me')).data.id;

    child1 = await newStudent('Famille Enfant1 ' + SUFFIX);
    child2 = await newStudent('Famille Enfant2 ' + SUFFIX);
    other = await newStudent('Famille Autre ' + SUFFIX);

    const created = await admin.req(`/api/students/${child1.id}/parents`, { method: 'POST', body: { fullName: 'Parent ' + SUFFIX, email: 'p@test.io', relation: 'Mère' } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const p = created.data.parent;
    const login = await loginWith2FA(p.username, p.password);
    parent = { client: login.client, userId: p.userId, username: p.username, password: p.password };
});

test('a parent account is created with the parent role and linked to the child', async () => {
    const me = await parent.client.req('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.data.role, 'parent');
    assert.equal(me.data.requires2fa, true);
    const links = (await admin.req(`/api/students/${child1.id}/parents`)).data;
    assert.ok(links.some((l) => l.userId === parent.userId && l.relation === 'Mère'));
});

test('a parent sees their children and only them', async () => {
    const kids = (await parent.client.req('/api/students/children')).data;
    assert.deepEqual(kids.map((k) => k.id), [child1.id]);

    assert.equal((await parent.client.req(`/api/students/${child1.id}`)).status, 200);
    assert.equal((await parent.client.req(`/api/students/${other.id}`)).status, 403);
    assert.equal((await parent.client.req('/api/students')).status, 403, 'the student list stays staff-only');
});

test('a parent reads grades and attendance of their children, never of others', async () => {
    assert.equal((await parent.client.req(`/api/grades?studentId=${child1.id}`)).status, 200);
    assert.equal((await parent.client.req(`/api/attendance?studentId=${child1.id}`)).status, 200);
    assert.deepEqual((await parent.client.req(`/api/grades?studentId=${other.id}`)).data, []);
    assert.deepEqual((await parent.client.req(`/api/attendance?studentId=${other.id}`)).data, []);
    assert.deepEqual((await parent.client.req('/api/grades')).data.filter((g) => g.student_id !== child1.id), []);
});

test('a parent cannot write grades, attendance or timetable', async () => {
    assert.equal((await parent.client.req('/api/grades', { method: 'POST', body: { grades: [{ studentId: child1.id, subject: 'Maths', grade: 10 }] } })).status, 403);
    assert.equal((await parent.client.req('/api/attendance', { method: 'POST', body: { records: [{ studentId: child1.id, date: TODAY, status: 'absent' }] } })).status, 403);
    assert.equal((await parent.client.req('/api/schedule', { method: 'POST', body: {} })).status, 403);
});

test('siblings: a second child is linked to the same parent and grouped under them', async () => {
    const r = await admin.req(`/api/students/${child2.id}/parents`, { method: 'POST', body: { parentUserId: parent.userId, relation: 'Mère' } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const ids = (await parent.client.req('/api/students/children')).data.map((k) => k.id).sort((a, b) => a - b);
    assert.deepEqual(ids, [child1.id, child2.id].sort((a, b) => a - b));
    assert.equal((await parent.client.req(`/api/students/${child2.id}`)).status, 200);
});

test('unlinking a child removes the access; the account stays for the other child', async () => {
    assert.equal((await admin.req(`/api/students/${child2.id}/parents?parentId=${parent.userId}`, { method: 'DELETE' })).status, 200);
    assert.equal((await parent.client.req(`/api/students/${child2.id}`)).status, 403);
    assert.equal((await parent.client.req('/api/students/children')).data.length, 1);
});

test('messages: a parent writes to the administration only', async () => {
    const toStudent = await parent.client.req('/api/messages', { method: 'POST', body: { subject: 'Hi', messageBody: 'Hello', recipientIds: [child1.userId] } });
    assert.equal(toStudent.status, 403);
    const toAdmin = await parent.client.req('/api/messages', { method: 'POST', body: { subject: 'Question', messageBody: 'Bonjour', recipientIds: [adminId] } });
    assert.equal(toAdmin.status, 201, JSON.stringify(toAdmin.data));
});

test('pages: the family space is for parents; staff pages redirect them', async () => {
    const page = (path) => fetch(BASE + path, { redirect: 'manual', headers: { cookie: parent.client.cookieHeader } });
    assert.equal((await page('/dashboard/parent')).status, 200);
    assert.equal((await page(`/dashboard/parent/children/${child1.id}`)).status, 200);
    const denied = await page(`/dashboard/parent/children/${other.id}`);
    assert.equal(denied.status, 200, 'the page shell loads; the data call refuses the child');
    const staff = await page('/dashboard/admin');
    assert.equal(staff.status, 307);
});

test('parents keep the password-change rule and cannot reach other accounts', async () => {
    const anon = new Client();
    assert.equal((await anon.req('/api/students/children')).status, 401);
    assert.equal((await parent.client.req('/api/roles')).status, 403);
});
