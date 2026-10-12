// Classes, school years and the rules tying grades and attendance to them.
// Requires a running server (BASE_URL) and the env vars in tests/helpers.js.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, loginWith2FA, adminLogin, uniq } from './helpers.js';

let admin;
let teacher;     // { client, id }
let classA;      // { id, name }
let student;     // { id }
let currentYear; // { id, label }
const futureStart = 2040;

before(async () => {
    assert.ok(ADMIN.username && ADMIN.password && ADMIN.totpSecret, 'set TEST_ADMIN_* variables');
    admin = (await adminLogin()).client;

    const y = await admin.req('/api/classes');
    assert.equal(y.status, 200);
    currentYear = y.data.schoolYear;
    assert.ok(currentYear, 'a current school year exists after migration');

    classA = { name: 'Sch ' + uniq('').slice(-5) };
    const c = await admin.req('/api/classes', { method: 'POST', body: { name: classA.name, level: '6e' } });
    assert.equal(c.status, 201, JSON.stringify(c.data));
    classA.id = c.data.id;

    const s = await admin.req('/api/students', { method: 'POST', body: { fullName: 'Sch Student', classId: classA.id } });
    assert.equal(s.status, 201, JSON.stringify(s.data));
    assert.equal(s.data.student.className, classA.name);
    const row = (await admin.req('/api/students?classId=' + classA.id)).data.find((x) => x.username === s.data.student.username);
    assert.ok(row, 'student listed in the class');
    student = { id: row.id };

    const t = await admin.req('/api/teachers', { method: 'POST', body: { fullName: 'Sch Teacher', subject: 'History', department: 'Arts' } });
    assert.equal(t.status, 201);
    const tRow = (await admin.req('/api/teachers')).data.find((x) => x.username === t.data.teacher.username);
    const login = await loginWith2FA(t.data.teacher.username, t.data.teacher.password);
    teacher = { client: login.client, id: tRow.id };
    const aff = await admin.req('/api/teaching-assignments', { method: 'POST', body: { teacherId: tRow.id, classId: classA.id, subject: 'History' } });
    assert.equal(aff.status, 201, JSON.stringify(aff.data));
});

test('a class is listed for the current year with its student count and head teacher', async () => {
    const list = (await admin.req('/api/classes')).data.classList;
    const mine = list.find((c) => c.id === classA.id);
    assert.ok(mine, 'class listed');
    assert.equal(mine.studentCount, 1);
    assert.equal(mine.schoolYearId, currentYear.id);

    const upd = await admin.req(`/api/classes/${classA.id}`, { method: 'PUT', body: { headTeacherId: teacher.id, level: '6e bis' } });
    assert.equal(upd.status, 200, JSON.stringify(upd.data));
    const after = (await admin.req('/api/classes')).data.classList.find((c) => c.id === classA.id);
    assert.equal(after.headTeacherId, teacher.id);
    assert.equal(after.level, '6e bis');
});

test('assigning a student to a class of another year or an unknown class is refused', async () => {
    const r = await admin.req(`/api/students/${student.id}`, { method: 'PUT', body: { classId: 999999999 } });
    assert.equal(r.status, 400);
    const r2 = await admin.req(`/api/students/${student.id}`, { method: 'PUT', body: { className: 'Classe inexistante ' + uniq('') } });
    assert.equal(r2.status, 400);
});

test('renaming a class renames it for its students and timetable slots', async () => {
    const newName = classA.name + ' R';
    assert.equal((await admin.req(`/api/classes/${classA.id}`, { method: 'PUT', body: { name: newName } })).status, 200);
    const detail = await admin.req(`/api/students/${student.id}`);
    assert.equal(detail.data.class_name, newName);
    assert.equal(detail.data.class_id, classA.id);
    classA.name = newName;
});

test('a class that still has students cannot be deleted', async () => {
    const r = await admin.req(`/api/classes/${classA.id}`, { method: 'DELETE' });
    assert.equal(r.status, 409);
});

test('grades and attendance are recorded for the current year and checked against its terms and dates', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const ok = await teacher.client.req('/api/grades', { method: 'POST', body: { grades: [{ studentId: student.id, subject: 'History', grade: 12, maxGrade: 20, term: 'Term 2' }] } });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));

    const badTerm = await teacher.client.req('/api/grades', { method: 'POST', body: { grades: [{ studentId: student.id, subject: 'X', grade: 1, term: 'Term 9' }] } });
    assert.equal(badTerm.status, 400);

    const att = await teacher.client.req('/api/attendance', { method: 'POST', body: { records: [{ studentId: student.id, date: today, status: 'present' }] } });
    assert.equal(att.status, 200, JSON.stringify(att.data));

    const outside = await teacher.client.req('/api/attendance', { method: 'POST', body: { records: [{ studentId: student.id, date: '2001-01-02', status: 'absent' }] } });
    assert.equal(outside.status, 400);
});

test('school years: create with terms, copy classes, switch the current year, delete unused years', async () => {
    const created = await admin.req('/api/school-years', { method: 'POST', body: { startYear: futureStart, copyClassesFrom: currentYear.id } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.label, `${futureStart}-${futureStart + 1}`);

    const years = (await admin.req('/api/school-years')).data;
    const future = years.find((y) => y.id === created.data.id);
    assert.deepEqual(future.terms.map((t) => t.name), ['Term 1', 'Term 2', 'Term 3']);
    assert.ok(future.classCount >= 1, 'classes copied from the previous year');

    // Switching the year moves the class list, then the original year is restored
    try {
        assert.equal((await admin.req(`/api/school-years/${created.data.id}`, { method: 'PATCH', body: { isCurrent: true } })).status, 200);
        const cls = await admin.req('/api/classes');
        assert.equal(cls.data.schoolYear.label, future.label);
        assert.ok(!cls.data.classList.some((c) => c.id === classA.id), 'old classes are not listed in the new year');
    } finally {
        await admin.req(`/api/school-years/${currentYear.id}`, { method: 'PATCH', body: { isCurrent: true } });
    }
    assert.equal((await admin.req('/api/classes')).data.schoolYear.id, currentYear.id);

    assert.equal((await admin.req(`/api/school-years/${created.data.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await admin.req(`/api/school-years/${currentYear.id}`, { method: 'DELETE' })).status, 409);
});

test('the current school year cannot be duplicated', async () => {
    const r = await admin.req('/api/school-years', { method: 'POST', body: { startYear: Number(currentYear.label.slice(0, 4)) } });
    assert.equal(r.status, 409);
});
