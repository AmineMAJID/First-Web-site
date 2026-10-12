// Small helpers shared by API route handlers
import { NextResponse } from 'next/server';
import { getSession } from './auth.js';
import { db } from './db.js';

export const json = (data, status = 200) => NextResponse.json(data, { status });
export const error = (message, status = 400) => NextResponse.json({ error: message }, { status });

// Ensure the request comes from any authenticated user (own-account routes)
export function requireAuth(request) {
    const session = getSession(request);
    if (!session) return { response: error('Unauthorized', 401) };
    return { session };
}

// Ensure the request comes from an authenticated user holding AT LEAST ONE of the permissions.
// Permissions are checked against the database on every request (see proxy.js).
export function requirePermission(request, ...keys) {
    const session = getSession(request);
    if (!session) return { response: error('Unauthorized', 401) };
    if (keys.length && !keys.some((k) => session.permissions.has(k))) return { response: error('Forbidden', 403) };
    return { session };
}

export const hasPerm = (session, key) => !!session?.permissions?.has(key);

// Path ids must be positive integers; anything else is simply "not found"
export const parseId = (value) => (/^[1-9]\d{0,17}$/.test(String(value ?? '')) ? Number(value) : null);

export async function readJson(request) {
    try {
        return await request.json();
    } catch {
        return null;
    }
}

export const isValidDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const isValidTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const clampStr = (s, max = 500) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

// Build a unique, URL-safe username from a full name (letters and digits only, max 12 chars + suffix)
export async function uniqueUsername(fullName) {
    const base = fullName
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user';
    let username = base;
    let n = 1;
    while (await db.get('SELECT 1 FROM users WHERE username = ?', [username])) username = `${base}${n++}`;
    return username;
}

// Next sequential code like STU-004 / TCH-002
export async function nextCode(table, column, prefix) {
    const row = await db.get(`SELECT ${column} AS code FROM ${table} ORDER BY id DESC LIMIT 1`);
    const n = row ? parseInt(row.code.split('-')[1], 10) + 1 : 1;
    return `${prefix}-${String(n).padStart(3, '0')}`;
}
