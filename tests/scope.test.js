// Teacher scope: a teacher with the built-in role only sees and grades the students of their classes.
// Requires a running server (BASE_URL) and the env vars in tests/helpers.js.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, loginWith2FA, adminLogin, uniq } from './helpers.js';

const TODAY = new Date().toISOString().slice(0, 10);
const SUFFIX = uniq('').slice(-5);
let admin;
let classA, classB;              // { id, name }
let studentA, studentB;          // { id }
let teachingT1, headT2;          // { client, id } : T1 teaches Maths in A; T2 is head teacher of A
let t1Id, t2Id;

async function newTeacher(name) {
    const t = await admin.req('/api/teachers', { method: 'POST', body: { fullName: name, subject: 'Maths', department: 'General' } });
    assert.equal(t.status, 201, JSON.stringify(t.data));
    const row = (await admin.req('/api/teachers')).data.find((x) => x.username === t.data.teacher.username);
    const login = await loginWith2FA(t.data.teacher.username, t.data.teacher.password);
    return { client: login.client, id: row.id };
}

async function newStudent(name, classId) {
    const s = await admin.req('/api/students', { method: 'POST', body: { fullName: name, classId } });
    assert.equal(s.status, 201, JSON.stringify(s.data));
    const row = (await admin.req('/api/students?classId=' + classId)).data.find((x) => x.username === s.data.student.username);
    return { id: row.id };
}

before(async () => {
    assert.ok(ADMIN.username && ADMIN.password && ADMIN.totpSecret, 'set TEST_ADMIN_* variables');
    admin = (await adminLogin()).client;

    classA = { name: 'ScA ' + SUFFIX };
    classB = { name: 'ScB ' + SUFFIX };
    classA.id = (await admin.req('/api/classes', { method: 'POST', body: { name: classA.name } })).data.id;
    classB.id = (await admin.req('/api/classes', { method: 'POST', body: { name: classB.name } })).data.id;

    studentA = await newStudent('Scope A ' + SUFFIX, classA.id);
    studentB = await newStudent('Scope B ' + SUFFIX, classB.id);

    teachingT1 = await newTeacher('Teach ' + SUFFIX);
    headT2 = await newTeacher('Head ' + SUFFIX);
    t1Id = teachingT1.id;
    t2Id = headT2.id;

    assert.equal((await admin.req('/api/teaching-assignments', { method: 'POST', body: { teacherId: t1Id, classId: classA.id, subject: 'Maths' } })).status, 201);
    assert.equal((await admin.req(`/api/classes/${classA.id}`, { method: 'PUT', body: { headTeacherId: t2Id } })).status, 200);
});

test('a teacher only lists the students of the classes they teach', async () => {
    const list = (await teachingT1.client.req('/api/students')).data;
    const ids = list.map((s) => s.id);
    assert.ok(ids.includes(studentA.id), 'student of the taught class is listed');
    assert.ok(!ids.includes(studentB.id), 'student of another class is hidden');
});

test('a teacher cannot open a student outside their classes', async () => {
    assert.equal((await teachingT1.client.req(`/api/students/${studentA.id}`)).status, 200);
    assert.equal((await teachingT1.client.req(`/api/students/${studentB.id}`)).status, 403);
    assert.equal((await teachingT1.client.req(`/api/students/${studentB.id}`, { method: 'PUT', body: { phone: '1' } })).status, 403);
});

test('grades: only the subjects a teacher teaches in the student\'s class', async () => {
    const ok = await teachingT1.client.req('/api/grades', { method: 'POST', body: { grades: [{ studentId: studentA.id, subject: 'Maths', term: 'Term 1', grade: 10, maxGrade: 20 }] } });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    const wrongSubject = await teachingT1.client.req('/api/grades', { method: 'POST', body: { grades: [{ studentId: studentA.id, subject: 'Art', term: 'Term 1', grade: 10 }] } });
    assert.equal(wrongSubject.status, 403);
    const wrongClass = await teachingT1.client.req('/api/grades', { method: 'POST', body: { grades: [{ studentId: studentB.id, subject: 'Maths', term: 'Term 1', grade: 10 }] } });
    assert.equal(wrongClass.status, 403);
    const visible = (await teachingT1.client.req('/api/grades')).data;
    assert.ok(visible.every((g) => g.student_id === studentA.id), 'grades listed only for the taught class');
});

test('attendance: a teacher and the head teacher of a class can record it, not other classes', async () => {
    const rec = (client, studentId) => client.req('/api/attendance', { method: 'POST', body: { records: [{ studentId, date: TODAY, status: 'absent' }] } });
    assert.equal((await rec(teachingT1.client, studentA.id)).status, 200);
    assert.equal((await rec(teachingT1.client, studentB.id)).status, 403);
    assert.equal((await rec(headT2.client, studentA.id)).status, 200, 'head teacher records attendance of their class');
    assert.equal((await rec(headT2.client, studentB.id)).status, 403);
});

test('the head teacher sees their class but cannot grade a subject they do not teach', async () => {
    const list = (await headT2.client.req('/api/students')).data.map((s) => s.id);
    assert.ok(list.includes(studentA.id));
    assert.ok(!list.includes(studentB.id));
    const r = await headT2.client.req('/api/grades', { method: 'POST', body: { grades: [{ studentId: studentA.id, subject: 'Maths', term: 'Term 1', grade: 5 }] } });
    assert.equal(r.status, 403);
});

test('assignments: adding and removing one changes what the teacher can grade', async () => {
    const add = await admin.req('/api/teaching-assignments', { method: 'POST', body: { teacherId: t2Id, classId: classB.id, subject: 'Art' } });
    assert.equal(add.status, 201, JSON.stringify(add.data));
    const dup = await admin.req('/api/teaching-assignments', { method: 'POST', body: { teacherId: t2Id, classId: classB.id, subject: 'Art' } });
    assert.equal(dup.status, 409);

    const r = await headT2.client.req('/api/grades', { method: 'POST', body: { grades: [{ studentId: studentB.id, subject: 'Art', term: 'Term 1', grade: 14 }] } });
    assert.equal(r.status, 200, JSON.stringify(r.data));

    assert.equal((await admin.req(`/api/teaching-assignments/${add.data.id}`, { method: 'DELETE' })).status, 200);
    const again = await headT2.client.req('/api/grades', { method: 'POST', body: { grades: [{ studentId: studentB.id, subject: 'Art', term: 'Term 1', grade: 15 }] } });
    assert.equal(again.status, 403);
});

test('the admin keeps seeing every student', async () => {
    const ids = (await admin.req('/api/students')).data.map((s) => s.id);
    assert.ok(ids.includes(studentA.id) && ids.includes(studentB.id));
});
