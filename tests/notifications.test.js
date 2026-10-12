// In-app notifications: created by the server on grades, absences, messages and announcements.
// Requires a running server (BASE_URL) and the env vars in tests/helpers.js.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, loginWith2FA, adminLogin, uniq, Client, classIdOf } from './helpers.js';

const SUFFIX = uniq('').slice(-5);
const TODAY = new Date().toISOString().slice(0, 10);
let admin, adminId;
let teacher, student, otherStudent, parent; // student / parent: { client, id, userId }
let className;

async function listNotifications(client) {
    const r = await client.req('/api/notifications');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
}

before(async () => {
    assert.ok(ADMIN.username && ADMIN.password && ADMIN.totpSecret, 'set TEST_ADMIN_* variables');
    admin = (await adminLogin()).client;
    adminId = (await admin.req('/api/auth/me')).data.id;

    className = 'Notif ' + SUFFIX;
    assert.equal((await admin.req('/api/classes', { method: 'POST', body: { name: className } })).status, 201);
    const classId = await classIdOf(admin, className);

    // Teacher teaching Maths in the class
    const t = await admin.req('/api/teachers', { method: 'POST', body: { fullName: 'Notif Prof ' + SUFFIX, subject: 'Maths', department: 'General' } });
    const tRow = (await admin.req('/api/teachers')).data.find((x) => x.username === t.data.teacher.username);
    teacher = { ...(await loginWith2FA(t.data.teacher.username, t.data.teacher.password)), id: tRow.id };
    assert.equal((await admin.req('/api/teaching-assignments', { method: 'POST', body: { teacherId: tRow.id, classId, subject: 'Maths' } })).status, 201);

    // Student (no 2FA) and a parent linked to them
    const s = await admin.req('/api/students', { method: 'POST', body: { fullName: 'Notif Eleve ' + SUFFIX, classId } });
    assert.equal(s.status, 201, JSON.stringify(s.data));
    const sRow = (await admin.req(`/api/students?classId=${classId}`)).data.find((x) => x.username === s.data.student.username);
    const sc = new Client();
    assert.equal((await sc.req('/api/auth/login', { method: 'POST', body: { username: s.data.student.username, password: s.data.student.password } })).status, 200);
    student = { client: sc, id: sRow.id, userId: sRow.userId };

    const o = await admin.req('/api/students', { method: 'POST', body: { fullName: 'Notif Autre ' + SUFFIX, classId } });
    const oRow = (await admin.req(`/api/students?classId=${classId}`)).data.find((x) => x.username === o.data.student.username);
    otherStudent = { id: oRow.id, userId: oRow.userId };

    const p = await admin.req(`/api/students/${student.id}/parents`, { method: 'POST', body: { fullName: 'Notif Parent ' + SUFFIX, relation: 'Père' } });
    assert.equal(p.status, 201, JSON.stringify(p.data));
    const pLogin = await loginWith2FA(p.data.parent.username, p.data.parent.password);
    parent = { client: pLogin.client, userId: p.data.parent.userId };
});

test('a new grade notifies the student and their parent, with a link to the grades page', async () => {
    const before = (await listNotifications(student.client)).unread;
    const r = await teacher.client.req('/api/grades', { method: 'POST', body: { grades: [{ studentId: student.id, subject: 'Maths', term: 'Term 1', grade: 15, maxGrade: 20 }] } });
    assert.equal(r.status, 200, JSON.stringify(r.data));

    const mine = await listNotifications(student.client);
    assert.equal(mine.unread, before + 1);
    const note = mine.items.find((n) => n.kind === 'grade');
    assert.equal(note.title, 'Nouvelle note');
    assert.equal(note.body, 'Maths : 15/20');
    assert.equal(note.link, '/dashboard/student/grades');
    assert.equal(note.isRead, false);

    const pn = await listNotifications(parent.client);
    assert.ok(pn.items.some((n) => n.kind === 'grade' && n.link === `/dashboard/parent/children/${student.id}`));
});

test('an absence and a late arrival notify the parent', async () => {
    const r = await teacher.client.req('/api/attendance', { method: 'POST', body: { records: [{ studentId: student.id, date: TODAY, status: 'absent' }] } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const pn = await listNotifications(parent.client);
    assert.ok(pn.items.some((n) => n.kind === 'absence' && n.title === 'Absence signalée'));

    await teacher.client.req('/api/attendance', { method: 'POST', body: { records: [{ studentId: student.id, date: TODAY, status: 'late' }] } });
    const pn2 = await listNotifications(parent.client);
    assert.ok(pn2.items.some((n) => n.kind === 'late'));
    const sn = await listNotifications(student.client);
    assert.ok(sn.items.some((n) => n.kind === 'late'), 'the student is informed too');
});

test('a message and an announcement reach the recipients', async () => {
    const before = (await listNotifications(student.client)).unread;
    const msg = await admin.req('/api/messages', { method: 'POST', body: { subject: 'Sortie scolaire ' + SUFFIX, messageBody: 'Détails', recipientIds: [student.userId] } });
    assert.equal(msg.status, 201, JSON.stringify(msg.data));
    const after = await listNotifications(student.client);
    assert.ok(after.items.some((n) => n.kind === 'message' && n.title === 'Nouveau message' && n.link === '/dashboard/messages'));
    assert.equal(after.unread, before + 1);

    const ann = await admin.req('/api/messages', { method: 'POST', body: { subject: 'Rentrée ' + SUFFIX, messageBody: 'Infos', isAnnouncement: true, recipientRole: 'student' } });
    assert.equal(ann.status, 201, JSON.stringify(ann.data));
    const withAnn = await listNotifications(student.client);
    assert.ok(withAnn.items.some((n) => n.kind === 'announcement' && n.body === 'Rentrée ' + SUFFIX));
});

test('marking as read lowers the counter; one account never sees another account\'s notifications', async () => {
    const mine = await listNotifications(student.client);
    const unreadIds = mine.items.filter((n) => !n.isRead).map((n) => n.id);
    assert.ok(unreadIds.length > 0);
    assert.equal((await student.client.req('/api/notifications', { method: 'POST', body: { ids: unreadIds.slice(0, 1) } })).status, 200);
    assert.equal((await listNotifications(student.client)).unread, mine.unread - 1);

    assert.equal((await student.client.req('/api/notifications', { method: 'POST', body: { all: true } })).status, 200);
    assert.equal((await listNotifications(student.client)).unread, 0);

    // The other student has none of the notifications above
    const other = await admin.req('/api/grades?studentId=' + otherStudent.id);
    assert.equal(other.status, 200);
    const grade = await teacher.client.req('/api/grades', { method: 'POST', body: { grades: [{ studentId: otherStudent.id, subject: 'Maths', term: 'Term 2', grade: 9, maxGrade: 20 }] } });
    assert.equal(grade.status, 200);
    const parentNotes = (await listNotifications(parent.client)).items.filter((n) => n.kind === 'grade');
    assert.ok(parentNotes.every((n) => n.link === `/dashboard/parent/children/${student.id}`), 'parent only sees their child');
});

test('the admin has notifications too, and an empty request is refused', async () => {
    const r = await admin.req('/api/notifications', { method: 'POST', body: {} });
    assert.equal(r.status, 400);
    assert.equal((await new Client().req('/api/notifications')).status, 401);
    assert.ok(adminId > 0);
});
