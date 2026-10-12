// Roles and permissions: staff management, feature switches per role, immediate effect on pages and API.
// Requires a running server (BASE_URL) and the env vars in tests/helpers.js.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, ADMIN, Client, loginWith2FA, adminLogin, uniq, classIdOf } from './helpers.js';

let admin;          // admin Client
let student;        // { id, className }
const created = { roles: [], staff: [] };

// Page request with the cookies of a client: returns the HTTP status and the redirect target
async function page(client, path) {
    const res = await fetch(BASE + path, { redirect: 'manual', headers: { cookie: client.cookieHeader } });
    return { status: res.status, location: res.headers.get('location') };
}

// Login for a staff account created with a role that does not require 2FA
async function plainLogin(username, password) {
    const c = new Client();
    const r = await c.req('/api/auth/login', { method: 'POST', body: { username, password } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return { client: c, landing: r.data.landing };
}

// Create a custom role and return its key
async function makeRole(permissions, requiresTwoFactor = true) {
    const label = uniq('Role ');
    const r = await admin.req('/api/roles', { method: 'POST', body: { label, requiresTwoFactor, permissions } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    created.roles.push(r.data.key);
    return r.data.key;
}

// Create a staff account with a temporary password
async function makeStaff(roleKey, fullName = 'Staff Test') {
    const r = await admin.req('/api/staff', { method: 'POST', body: { fullName, email: '', roleKey } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    created.staff.push(r.data.staff.id);
    return r.data.staff;
}

async function roleRow(key) {
    return (await admin.req('/api/roles')).data.roles.find((r) => r.key === key);
}

before(async () => {
    assert.ok(ADMIN.username && ADMIN.password && ADMIN.totpSecret, 'set TEST_ADMIN_* variables');
    admin = (await adminLogin()).client;
    const className = 'Perm ' + uniq('').slice(-4);
    assert.equal((await admin.req('/api/classes', { method: 'POST', body: { name: className } })).status, 201);
    const s = await admin.req('/api/students', { method: 'POST', body: { fullName: 'Perm Student', className, email: '' } });
    assert.equal(s.status, 201);
    const username = s.data.student.username;
    const row = (await admin.req(`/api/students?search=${username}`)).data.find((x) => x.username === username);
    assert.ok(row, 'created student is listed');
    student = { id: row.id, className };
});

test('admin: staff and roles only, no timetable, reads grades but does not record them', async () => {
    const me = (await admin.req('/api/auth/me')).data;
    assert.ok(me.permissions.includes('staff.manage'));
    assert.ok(me.permissions.includes('roles.manage'));
    assert.ok(me.permissions.includes('students.view'));
    assert.ok(!me.permissions.includes('schedule.view'));
    assert.ok(!me.permissions.includes('schedule.manage'));
    assert.ok(!me.permissions.includes('grades.record'));
    assert.ok(!me.permissions.includes('attendance.record'));
    assert.ok(me.permissions.includes('grades.view_all'));

    // The administrator page for the timetable is gone for the admin account
    const sched = await page(admin, '/dashboard/admin/schedule');
    assert.equal(sched.status, 307);
    assert.equal(new URL(sched.location, BASE).pathname, '/dashboard/admin');
    assert.equal((await page(admin, '/dashboard/admin/staff')).status, 200);
    assert.equal((await page(admin, '/dashboard/admin/roles')).status, 200);
    assert.equal((await admin.req(`/api/grades?studentId=${student.id}`)).status, 200);
    assert.equal((await admin.req(`/api/grades`, { method: 'POST', body: { grades: [] } })).status, 403);
});

test('staff management is for the administrator only', async () => {
    const t = await admin.req('/api/teachers', { method: 'POST', body: { fullName: uniq('Teacher Perm'), subject: 'Physics' } });
    assert.equal(t.status, 201);
    const teacherLogin = await loginWith2FA(t.data.teacher.username, t.data.teacher.password);
    const tc = teacherLogin.client;

    assert.equal((await tc.req('/api/roles')).status, 403);
    assert.equal((await tc.req('/api/staff')).status, 403);
    assert.equal((await tc.req('/api/roles', { method: 'POST', body: { label: 'X' } })).status, 403);
    const p = await page(tc, '/dashboard/admin/staff');
    assert.equal(p.status, 307);
    assert.equal(new URL(p.location, BASE).pathname, '/dashboard/teacher');
    // A teacher can still open the pages of the role
    assert.equal((await page(tc, '/dashboard/teacher/attendance')).status, 200);
    // Unknown pages are refused, not served
    assert.equal((await page(tc, '/dashboard/nope')).status, 307);
});

test('the administrator role and the locked permissions cannot be changed', async () => {
    assert.equal((await admin.req('/api/roles/admin', { method: 'PUT', body: { label: 'Hacked' } })).status, 403);
    assert.equal((await admin.req('/api/roles/admin', { method: 'DELETE' })).status, 403);
    assert.equal((await admin.req('/api/roles', { method: 'POST', body: { label: uniq('Bad '), permissions: ['staff.manage'] } })).status, 400);
    assert.equal((await admin.req('/api/roles', { method: 'POST', body: { label: uniq('Bad '), permissions: ['home.admin'] } })).status, 400);
    assert.equal((await admin.req('/api/roles', { method: 'POST', body: { label: uniq('Bad '), permissions: ['no.such.feature'] } })).status, 400);
    const key = await makeRole(['students.view']);
    assert.equal((await admin.req(`/api/roles/${key}`, { method: 'PUT', body: { permissions: ['roles.manage'] } })).status, 400);
});

test('a custom role gets exactly the features switched on for it (Supervisor example)', async () => {
    // Supervisor: presence entry for the classes, reading of students, messages. No grades, no timetable.
    const key = await makeRole(['attendance.record', 'students.view', 'messages.view', 'messages.send', 'schedule.view']);
    const staff = await makeStaff(key, 'Surveillant Test');
    const login = await loginWith2FA(staff.username, staff.password);
    const sc = login.client;

    const me = (await sc.req('/api/auth/me')).data;
    assert.ok(me.roleLabel);
    assert.ok(me.permissions.includes('attendance.record'));
    assert.ok(!me.permissions.includes('grades.record'));
    assert.ok(!me.permissions.includes('staff.manage'));
    assert.ok(me.permissions.includes('account.settings'), 'the account always keeps its settings page');

    // API follows the permissions
    const rec = await sc.req('/api/attendance', { method: 'POST', body: { records: [{ studentId: student.id, date: '2026-10-05', status: 'present' }] } });
    assert.equal(rec.status, 200, JSON.stringify(rec.data));
    assert.equal((await sc.req('/api/grades')).status, 403);
    assert.equal((await sc.req('/api/schedule', { method: 'POST', body: {} })).status, 403);
    assert.equal((await sc.req('/api/students')).status, 200);
    assert.equal((await sc.req('/api/students', { method: 'POST', body: {} })).status, 403);
    assert.equal((await sc.req('/api/reports')).status, 403);

    // Pages follow the permissions
    assert.equal((await page(sc, '/dashboard/teacher/attendance')).status, 200);
    assert.equal((await page(sc, '/dashboard/teacher/grades')).status, 307);
    assert.equal((await page(sc, '/dashboard/admin/staff')).status, 307);
    assert.equal((await page(sc, '/dashboard/settings')).status, 200);
});

test('changing a role takes effect at once, on pages and on the API, without new login', async () => {
    const attendanceRole = await makeRole(['attendance.record', 'messages.view']);
    const staff = await makeStaff(attendanceRole, 'Immediate Test');
    const sc = (await loginWith2FA(staff.username, staff.password)).client;
    const body = { records: [{ studentId: student.id, date: '2026-10-06', status: 'late' }] };
    assert.equal((await sc.req('/api/attendance', { method: 'POST', body })).status, 200);

    // The administrator removes the attendance feature from the role
    const r1 = await admin.req(`/api/roles/${attendanceRole}`, { method: 'PUT', body: { permissions: ['messages.view'] } });
    assert.equal(r1.status, 200);
    assert.equal((await sc.req('/api/attendance', { method: 'POST', body })).status, 403);
    assert.equal((await page(sc, '/dashboard/teacher/attendance')).status, 307);
    assert.ok(!(await sc.req('/api/auth/me')).data.permissions.includes('attendance.record'));

    // And gives it back
    await admin.req(`/api/roles/${attendanceRole}`, { method: 'PUT', body: { permissions: ['attendance.record', 'messages.view'] } });
    assert.equal((await sc.req('/api/attendance', { method: 'POST', body })).status, 200);
});

test('Teacher to Supervisor example: presence moves from the teacher role to the supervisor role', async () => {
    const t = await admin.req('/api/teachers', { method: 'POST', body: { fullName: uniq('Teacher Move'), subject: 'Art' } });
    const teacher = await loginWith2FA(t.data.teacher.username, t.data.teacher.password);
    const aff = await admin.req('/api/teaching-assignments', { method: 'POST', body: { teacherId: (await admin.req('/api/teachers')).data.find((x) => x.username === t.data.teacher.username).id, classId: await classIdOf(admin, student.className), subject: 'Art' } });
    assert.equal(aff.status, 201, JSON.stringify(aff.data));
    const before = await roleRow('teacher');
    const originalPerms = before.permissions;
    const supervisor = await makeRole(['attendance.record', 'students.view']);
    const sup = await makeStaff(supervisor, 'Supervisor Move');
    const supLogin = await loginWith2FA(sup.username, sup.password);
    const body = { records: [{ studentId: student.id, date: '2026-10-07', status: 'absent' }] };

    try {
        assert.equal((await teacher.client.req('/api/attendance', { method: 'POST', body })).status, 200);

        // 6 months later: presence is removed from teachers...
        const withoutAttendance = originalPerms.filter((p) => p !== 'attendance.record');
        assert.equal((await admin.req('/api/roles/teacher', { method: 'PUT', body: { permissions: withoutAttendance } })).status, 200);
        assert.equal((await teacher.client.req('/api/attendance', { method: 'POST', body })).status, 403);
        assert.equal((await page(teacher.client, '/dashboard/teacher/attendance')).status, 307);
        assert.equal((await page(teacher.client, '/dashboard/teacher')).status, 200, 'the teacher keeps the rest');

        // ...and given to supervisors
        assert.equal((await supLogin.client.req('/api/attendance', { method: 'POST', body })).status, 200);
        assert.equal((await page(supLogin.client, '/dashboard/teacher/attendance')).status, 200);
    } finally {
        // Restore the teacher role for the other tests
        await admin.req('/api/roles/teacher', { method: 'PUT', body: { permissions: originalPerms } });
    }
    assert.equal((await teacher.client.req('/api/attendance', { method: 'POST', body })).status, 200);
});

test('a timetable permission works for the role that holds it', async () => {
    const key = await makeRole(['schedule.manage', 'schedule.view'], false);
    const staff = await makeStaff(key, 'Planner Test');
    const c = (await plainLogin(staff.username, staff.password)).client;

    const slot = { className: student.className, subject: 'Art', dayOfWeek: 'Friday', startTime: '14:00', endTime: '15:00', room: 'R1' };
    const created1 = await c.req('/api/schedule', { method: 'POST', body: slot });
    assert.equal(created1.status, 201, JSON.stringify(created1.data));
    assert.equal((await c.req('/api/schedule', { method: 'POST', body: { ...slot, startTime: '14:30', endTime: '15:30' } })).status, 409);
    assert.equal((await c.req('/api/schedule', { method: 'POST', body: { ...slot, startTime: '16:00', endTime: '15:00' } })).status, 400);
    assert.equal((await c.req(`/api/schedule/${created1.data.id}`, { method: 'PUT', body: { ...slot, room: 'R2' } })).status, 200);
    assert.equal((await c.req(`/api/schedule/${created1.data.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await c.req(`/api/schedule/${created1.data.id}`, { method: 'DELETE' })).status, 404);
    assert.equal((await c.req('/api/schedule/xyz', { method: 'DELETE' })).status, 404);
    assert.equal((await page(c, '/dashboard/admin/schedule')).status, 200);
});

test('an account with no feature lands on its settings, the only page left', async () => {
    const key = await makeRole([], false);
    const staff = await makeStaff(key, 'Nothing Test');
    const login = await plainLogin(staff.username, staff.password);
    assert.equal(login.landing, '/dashboard/settings');
    assert.equal((await page(login.client, '/dashboard/teacher')).status, 307);
    assert.equal((await page(login.client, '/dashboard/settings')).status, 200);
    assert.equal((await login.client.req('/api/students')).status, 403);
});

test('staff: role change revokes the sessions, deletion is refused while the role is in use', async () => {
    // No 2FA on these roles: a second sign-in within the same 30 s window would reuse the TOTP step
    const first = await makeRole(['messages.view'], false);
    const second = await makeRole(['messages.view', 'reports.view'], false);
    const staff = await makeStaff(first, 'Move Test');
    const login = await plainLogin(staff.username, staff.password);

    assert.equal((await admin.req(`/api/roles/${first}`, { method: 'DELETE' })).status, 409);
    const moved = await admin.req(`/api/staff/${staff.id}`, { method: 'PUT', body: { roleKey: second } });
    assert.equal(moved.status, 200);
    // The old session is closed: the member signs in again and gets the new permissions
    assert.equal((await login.client.req('/api/auth/me')).status, 401);
    const again = await plainLogin(staff.username, staff.password);
    assert.ok((await again.client.req('/api/auth/me')).data.permissions.includes('reports.view'));
    assert.equal((await again.client.req('/api/reports')).status, 200);
});

test('staff: reset password and reset 2FA are admin actions', async () => {
    const key = await makeRole(['messages.view'], true);
    const staff = await makeStaff(key, 'Reset Test');
    const login = await loginWith2FA(staff.username, staff.password);
    const reset = await admin.req(`/api/staff/${staff.id}`, { method: 'POST', body: { action: 'reset-password' } });
    assert.equal(reset.status, 200);
    assert.ok(reset.data.password);
    assert.equal((await login.client.req('/api/auth/me')).status, 401, 'password reset closes the sessions');
    const newLogin = new Client();
    assert.equal((await newLogin.req('/api/auth/login', { method: 'POST', body: { username: staff.username, password: reset.data.password } })).status, 200);

    assert.equal((await admin.req(`/api/staff/${staff.id}`, { method: 'POST', body: { action: 'reset-2fa' } })).status, 200);
    assert.equal((await admin.req(`/api/staff/${staff.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await admin.req(`/api/staff/${staff.id}`, { method: 'DELETE' })).status, 404);
});

test('cleanup: remove the test roles (after their accounts are gone)', async () => {
    for (const id of created.staff) await admin.req(`/api/staff/${id}`, { method: 'DELETE' });
    for (const key of created.roles) {
        const r = await admin.req(`/api/roles/${key}`, { method: 'DELETE' });
        assert.ok([200, 409].includes(r.status), `unexpected ${r.status}`);
    }
});
