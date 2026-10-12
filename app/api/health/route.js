import { db } from '@/lib/db';
import { json, error } from '@/lib/api';

export async function GET() {
    try {
        const row = await db.get('SELECT 1 AS ok');
        return json({ status: row?.ok === 1 ? 'ok' : 'error', time: new Date().toISOString() });
    } catch {
        return error('Database unavailable', 503);
    }
}
