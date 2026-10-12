'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { api } from '@/lib/client';

const REFRESH_MS = 30000;

// Bell with an unread counter. Refreshes every 30 seconds and when the tab becomes visible again.
export default function NotificationBell() {
    const router = useRouter();
    const [data, setData] = useState({ unread: 0, items: [] });
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);

    const load = useCallback(() => {
        api('/api/notifications').then(setData).catch(() => {});
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, REFRESH_MS);
        const onVisible = () => { if (document.visibilityState === 'visible') load(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
    }, [load]);

    // Close on outside click or Escape
    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const openItem = async (n) => {
        setOpen(false);
        if (!n.isRead) {
            await api('/api/notifications', { method: 'POST', body: { ids: [n.id] } }).catch(() => {});
        }
        load();
        if (n.link) router.push(n.link);
    };

    const markAll = async () => {
        await api('/api/notifications', { method: 'POST', body: { all: true } }).catch(() => {});
        load();
    };

    return (
        <div ref={wrapRef} style={{ position: 'relative' }}>
            <button
                type="button"
                onClick={() => { setOpen((v) => !v); if (!open) load(); }}
                aria-label={data.unread ? `Notifications, ${data.unread} non lue(s)` : 'Notifications'}
                aria-expanded={open}
                aria-haspopup="true"
                style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '8px', color: 'inherit' }}
            >
                <Bell size={20} />
                {data.unread > 0 && (
                    <span aria-hidden="true" style={{
                        position: 'absolute', top: 2, right: 0, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9,
                        background: '#ef4444', color: 'white', fontSize: 11, fontWeight: 700, lineHeight: '18px', textAlign: 'center',
                    }}>{data.unread > 99 ? '99+' : data.unread}</span>
                )}
            </button>
            {open && (
                <div role="menu" style={{
                    position: 'absolute', right: 0, top: '100%', width: 340, maxHeight: 420, overflowY: 'auto', zIndex: 60,
                    background: 'var(--bg-card, #fff)', color: 'var(--text, #111)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12,
                    boxShadow: '0 10px 30px rgba(0,0,0,.15)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                        <strong>Notifications</strong>
                        {data.unread > 0 && <button type="button" className="btn btn-outline btn-sm" onClick={markAll}>Tout marquer lu</button>}
                    </div>
                    {data.items.length === 0 && <p style={{ padding: '16px', color: 'var(--text-muted)' }}>Aucune notification pour l’instant.</p>}
                    {data.items.map((n) => (
                        <button key={n.id} type="button" role="menuitem" onClick={() => openItem(n)} style={{
                            display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', cursor: 'pointer',
                            background: n.isRead ? 'transparent' : 'rgba(59,130,246,.08)', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'inherit',
                        }}>
                            <div style={{ fontWeight: n.isRead ? 500 : 700 }}>{n.title}</div>
                            {n.body && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{n.body}</div>}
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{new Date(n.createdAt).toLocaleString('fr-FR')}</div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
