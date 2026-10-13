// Administration dashboard: today's absences and late arrivals, pending tasks, unread messages.
// Requires a running server (BASE_URL) and the env vars in tests/helpers.js.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, loginWith2FA, adminLogin, uniq, classIdOf } from './helpers.js';

const SUFFIX = uniq('').slice(-5);
const TODAY = new Date().toISOString().slice(0, 10);
let admin, teacher, student;

before(async () => {
    assert.ok(ADMIN.username && ADMIN.password && ADMIN.totpSecret, 'set TEST_ADMIN_* variables');
    admin = (await adminLogin()).client;
    const className = 'Dash ' + SUFFIX;
    await admin.req('/api/classes', { method: 'POST', body: { name: className } });
    const classId = await classIdOf(admin, className);

    const t = await admin.req('/api/teachers', { method: 'POST', body: { fullName: 'Dash Prof ' + SUFFIX, subject: 'Art' } });
    const tRow = (await admin.req('/api/teachers')).data.find((x) => x.username === t.data.teacher.username);
    await admin.req('/api/teaching-assignments', { method: 'POST', body: { teacherId: tRow.id, classId, subject: 'Art' } });
    teacher = await loginWith2FA(t.data.teacher.username, t.data.teacher.password);

    const s = await admin.req('/api/students', { method: 'POST', body: { fullName: 'Dash Eleve ' + SUFFIX, classId } });
    const sRow = (await admin.req(`/api/students?classId=${classId}`)).data.find((x) => x.username === s.data.student.username);
    student = { id: sRow.id, name: s.data.student.fullName };
});

test('the dashboard lists today\'s absences with the student and class', async () => {
    assert.equal((await teacher.client.req('/api/attendance', { method: 'POST', body: { records: [{ studentId: student.id, date: TODAY, status: 'absent' }] } })).status, 200);
    const r = await admin.req(`/api/dashboard/admin?date=${TODAY}`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.date, TODAY);
    assert.ok(r.data.absent.some((a) => a.studentId === student.id && a.studentName === student.name));
    assert.equal(typeof r.data.unreadMessages, 'number');
    assert.ok(Array.isArray(r.data.tasks));
});

test('pending tasks point to where they are fixed and only appear when they exist', async () => {
    const r = await admin.req(`/api/dashboard/admin?date=${TODAY}`);
    // The test class was created without a head teacher
    const head = r.data.tasks.find((t) => t.key === 'no-head');
    assert.ok(head, 'classes without head teacher are reported (the test class has none)');
    assert.equal(head.href, '/dashboard/admin/classes');
    assert.ok(r.data.tasks.every((t) => t.count > 0), 'empty tasks are hidden');
});

test('invalid dates are refused; teachers cannot open the administration dashboard', async () => {
    assert.equal((await admin.req('/api/dashboard/admin?date=yesterday')).status, 400);
    assert.equal((await teacher.client.req('/api/dashboard/admin')).status, 403);
});
