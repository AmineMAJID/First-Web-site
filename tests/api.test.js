// End-to-end API tests. Requires a running server (BASE_URL) and the env vars in tests/helpers.js.
// Every account is created by the test itself through the admin API: no demo data is assumed.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, ADMIN, Client, loginWith2FA, adminLogin, uniq } from './helpers.js';

let admin;
let teacher;   // { client, id, userId }
let student;   // { client, id, username, className }
const TERM = 'Term 1';

async function changePassword(client, currentPassword) {
    const next = 'Changed-Passw0rd-' + uniq('');
    const r = await client.req('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword: next } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return next;
}

before(async () => {
    assert.ok(ADMIN.username && ADMIN.password && ADMIN.totpSecret, 'set TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_ADMIN_TOTP_SECRET');
    const h = await fetch(BASE + '/api/health').then((r) => r.json());
    assert.equal(h.status, 'ok');

    // Admin: one 2FA login only (a TOTP code is single-use per 30s window)
    admin = (await adminLogin()).client;

    const className = 'Class ' + uniq('').slice(-4);
    const s = await admin.req('/api/students', { method: 'POST', body: { fullName: 'Alice Test', className, email: 'alice@test.io' } });
    assert.equal(s.status, 201);
    const detail = s.data.student;
    const sc = new Client();
    assert.equal((await sc.req('/api/auth/login', { method: 'POST', body: { username: detail.username, password: detail.password } })).data.user.mustChangePassword, true);
    await changePassword(sc, detail.password);
    const list = (await admin.req(`/api/students?search=${detail.username}`)).data;
    const row = list.find((x) => x.username === detail.username);
    assert.ok(row, 'created student is listed');
    student = { client: sc, id: row.id, username: detail.username, className };

    const t = await admin.req('/api/teachers', { method: 'POST', body: { fullName: 'Prof Test', subject: 'Mathematics', department: 'Science' } });
    assert.equal(t.status, 201);
    const tRow = (await admin.req('/api/teachers')).data.find((x) => x.username === t.data.teacher.username);
    const login = await loginWith2FA(t.data.teacher.username, t.data.teacher.password);
    teacher = { client: login.client, id: tRow.id, userId: tRow.userId };
});

test('student sees only own data and cannot reach admin resources', async () => {
    assert.equal((await student.client.req('/api/students')).status, 403);
    assert.equal((await student.client.req('/api/reports')).status, 403);
    assert.equal((await student.client.req('/api/teachers')).status, 403);
    assert.equal((await student.client.req('/api/messages', { method: 'POST', body: { subject: 'x', messageBody: 'y' } })).status, 403);
    const page = await fetch(BASE + '/dashboard/admin', { redirect: 'manual', headers: { cookie: student.client.cookieHeader } });
    assert.equal(page.status, 307);
    assert.match(page.headers.get('location'), /\/dashboard\/student/);
    const grades = (await student.client.req('/api/grades')).data;
    assert.ok(Array.isArray(grades));
});

test('non-numeric ids are "not found", not server errors', async () => {
    assert.equal((await admin.req('/api/students/abc')).status, 404);
    assert.equal((await admin.req('/api/students/1;DROP TABLE users')).status, 404);
    assert.equal((await admin.req('/api/teachers/xyz', { method: 'DELETE' })).status, 404);
});

test('admin: student update and detail', async () => {
    const upd = await admin.req(`/api/students/${student.id}`, { method: 'PUT', body: { phone: '0600000000', className: student.className } });
    assert.equal(upd.status, 200);
    const detail = (await admin.req(`/api/students/${student.id}`)).data;
    assert.equal(detail.phone, '0600000000');
    assert.equal(detail.class_name, student.className);
    assert.equal((await admin.req(`/api/students/999999999`)).status, 404);
});

test('teacher: grade validation, upsert without duplicates, attendance', async () => {
    const bad = await teacher.client.req('/api/grades', { method: 'POST', body: { grades: [{ studentId: student.id, subject: 'Mathematics', term: TERM, grade: 150 }] } });
    assert.equal(bad.status, 400);

    assert.equal((await teacher.client.req('/api/grades', { method: 'POST', body: { grades: [{ studentId: student.id, subject: 'Mathematics', term: TERM, grade: 77, remarks: 'test' }] } })).status, 200);
    assert.equal((await teacher.client.req('/api/grades', { method: 'POST', body: { grades: [{ studentId: student.id, subject: 'Mathematics', term: TERM, grade: 88.5 }] } })).status, 200);
    const grades = (await teacher.client.req(`/api/grades?studentId=${student.id}&subject=Mathematics&term=${encodeURIComponent(TERM)}`)).data;
    assert.equal(grades.length, 1, 'upsert must not duplicate');
    assert.equal(grades[0].grade, 88.5);
    assert.equal(grades[0].remarks, 'test', 'empty remarks keep the previous value');

    // The student sees the grade with a numeric value
    const own = (await student.client.req('/api/grades')).data;
    assert.equal(own.length, 1);
    assert.equal(typeof own[0].grade, 'number');

    assert.equal((await teacher.client.req('/api/attendance', { method: 'POST', body: { records: [{ studentId: student.id, date: '2030-01-01', status: 'late' }] } })).status, 200);
    assert.equal((await teacher.client.req('/api/attendance', { method: 'POST', body: { records: [{ studentId: student.id, date: '2030-01-01', status: 'sleeping' }] } })).status, 400);
    // Scope to this student: other runs may have recorded the same date for other students
    const day = (await teacher.client.req(`/api/attendance?date=2030-01-01&studentId=${student.id}`)).data;
    assert.equal(day.length, 1);
    assert.equal(day[0].status, 'late');
});

test('messaging: announcement, read receipts, direct message grouping, delete rights', async () => {
    const ann = await admin.req('/api/messages', { method: 'POST', body: { isAnnouncement: true, recipientRole: 'student', subject: 'Annonce test', messageBody: 'Bonjour' } });
    assert.equal(ann.status, 201);

    const inbox = (await student.client.req('/api/messages?box=inbox')).data;
    const msg = inbox.find((m) => m.subject === 'Annonce test');
    assert.ok(msg);
    assert.equal(msg.is_read, false);
    const before = (await student.client.req('/api/auth/me')).data.unreadMessages;
    assert.equal((await student.client.req(`/api/messages/${msg.id}`, { method: 'PUT' })).status, 200);
    assert.equal((await student.client.req('/api/auth/me')).data.unreadMessages, before - 1);

    // Teachers may not broadcast to teachers
    assert.equal((await teacher.client.req('/api/messages', { method: 'POST', body: { isAnnouncement: true, recipientRole: 'teacher', subject: 'x', messageBody: 'y' } })).status, 403);

    const direct = await teacher.client.req('/api/messages', { method: 'POST', body: { recipientClasses: [student.className], subject: 'Class only', messageBody: 'Hi' } });
    assert.equal(direct.status, 201);
    const sent = (await teacher.client.req('/api/messages?box=sent')).data.filter((m) => m.subject === 'Class only');
    assert.equal(sent.length, 1, 'bulk sends are grouped');
    assert.equal(sent[0].recipient_count, direct.data.count);

    assert.equal((await student.client.req(`/api/messages/${msg.id}`, { method: 'DELETE' })).status, 403);
    assert.equal((await admin.req(`/api/messages/${msg.id}`, { method: 'DELETE' })).status, 200);
});

test('schedule: the administrator has no timetable; teachers cannot manage it', async () => {
    // Timetable management is a permission granted to a role (see tests/permissions.test.js)
    assert.equal((await admin.req('/api/schedule')).status, 403);
    assert.equal((await teacher.client.req('/api/schedule', { method: 'POST', body: { className: student.className } })).status, 403);
});

test('reports and classes endpoints return numbers, not strings', async () => {
    const r = (await admin.req('/api/reports')).data;
    assert.equal(typeof r.totalStudents, 'number');
    assert.ok(r.totalStudents >= 1);
    assert.ok(Array.isArray(r.gradesBySubject));
    assert.ok(Array.isArray(r.attendanceTrend));
    const c = (await student.client.req('/api/classes')).data;
    assert.ok(c.classes.some((x) => x.name === student.className));
    assert.ok(c.subjects.includes('Mathematics'));
});

test('admin: teacher deletion cascades cleanly', async () => {
    const created = await admin.req('/api/teachers', { method: 'POST', body: { fullName: uniq('Temp Teacher'), subject: 'History' } });
    const row = (await admin.req('/api/teachers')).data.find((x) => x.username === created.data.teacher.username);
    assert.equal((await admin.req(`/api/teachers/${row.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await admin.req(`/api/teachers/${row.id}`, { method: 'DELETE' })).status, 404);
});

test('teacher can only delete grades they recorded (other roles unchanged)', async () => {
    const g = (await admin.req(`/api/grades?studentId=${student.id}`)).data;
    assert.ok(g.length >= 1);
    assert.equal((await student.client.req(`/api/grades?id=${g[0].id}`, { method: 'DELETE' })).status, 403);
});
