// Teachers [id] API – PUT, DELETE, POST (reset password / reset 2FA)
import { db } from '@/lib/db';
import { hashPassword, generateTempPassword } from '@/lib/password';
import { revokeUserSessions } from '@/lib/session';
import { recordEvent, clientIp, userAgent } from '@/lib/security';
import { json, error, readJson, requirePermission, clampStr, parseId } from '@/lib/api';

export async function PUT(request, { params }) {
    const { response } = requirePermission(request, 'teachers.manage');
    if (response) return response;
    const id = parseId((await params).id);
    const body = await readJson(request);
    if (!body) return error('Invalid body');
    if (!id) return error('Teacher not found', 404);

    const teacher = await db.get('SELECT * FROM teachers WHERE id = ?', [id]);
    if (!teacher) return error('Teacher not found', 404);

    await db.run('UPDATE users SET full_name = COALESCE(?, full_name), email = COALESCE(?, email), updated_at = now() WHERE id = ?',
        [clampStr(body.fullName, 100) || null, body.email !== undefined ? clampStr(body.email, 120) : null, teacher.user_id]);
    await db.run('UPDATE teachers SET subject = COALESCE(?, subject), department = COALESCE(?, department), phone = COALESCE(?, phone) WHERE id = ?',
        [clampStr(body.subject, 60) || null, clampStr(body.department, 60) || null, body.phone ?? null, id]);
    return json({ success: true });
}

export async function POST(request, { params }) {
    const { response } = requirePermission(request, 'teachers.manage');
    if (response) return response;
    const id = parseId((await params).id);
    const body = await readJson(request);
    if (!id) return error('Teacher not found', 404);
    const teacher = await db.get('SELECT t.user_id, u.username FROM teachers t JOIN users u ON u.id = t.user_id WHERE t.id = ?', [id]);
    if (!teacher) return error('Teacher not found', 404);

    if (body?.action === 'reset-password') {
        const password = generateTempPassword();
        await db.run('UPDATE users SET password_hash = ?, must_change_password = TRUE, updated_at = now() WHERE id = ?',
            [await hashPassword(password), teacher.user_id]);
        await revokeUserSessions(teacher.user_id);
        await recordEvent('password_reset_by_admin', { username: teacher.username, userId: teacher.user_id, ip: clientIp(request), ua: userAgent(request) });
        return json({ success: true, password });
    }
    if (body?.action === 'reset-2fa') {
        // Removes the enrolled secret: the teacher must enrol a new authenticator at next login
        await db.run('UPDATE users SET two_factor_secret = NULL, two_factor_last_step = NULL, updated_at = now() WHERE id = ?', [teacher.user_id]);
        await revokeUserSessions(teacher.user_id);
        await recordEvent('2fa_reset_by_admin', { username: teacher.username, userId: teacher.user_id, ip: clientIp(request), ua: userAgent(request) });
        return json({ success: true });
    }
    return error('Unknown action');
}

export async function DELETE(request, { params }) {
    const { response } = requirePermission(request, 'teachers.manage');
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return error('Teacher not found', 404);
    const teacher = await db.get('SELECT user_id FROM teachers WHERE id = ?', [id]);
    if (!teacher) return error('Teacher not found', 404);
    await db.run('DELETE FROM users WHERE id = ?', [teacher.user_id]);
    return json({ success: true });
}
