'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Printer, MonitorSmartphone, LogOut } from 'lucide-react';
import { useToast } from '@/components/Toast';
import ConfirmDialog from '@/components/ConfirmDialog';
import { api } from '@/lib/client';

// Two-factor recovery codes: generated once, shown once, each usable once.
export function RecoveryCodesCard() {
    const toast = useToast();
    const [remaining, setRemaining] = useState(null);
    const [codes, setCodes] = useState(null);
    const [confirm, setConfirm] = useState(false);

    const load = useCallback(() => api('/api/account/recovery-codes').then((d) => setRemaining(d.remaining)).catch(() => {}), []);
    useEffect(() => { load(); }, [load]);

    const generate = async () => {
        setConfirm(false);
        try {
            const data = await api('/api/account/recovery-codes', { method: 'POST' });
            setCodes(data.codes);
            setRemaining(data.remaining);
        } catch (e) { toast.error(e.message); }
    };

    return (
        <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><KeyRound size={20} /> Codes de secours</h3>
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                Ils permettent de vous connecter si vous perdez votre téléphone. Chaque code ne fonctionne qu’une fois.
                Gardez-les dans un endroit sûr.
            </p>
            <p style={{ margin: '12px 0' }}>Codes restants : <strong>{remaining ?? '—'}</strong></p>
            <button className="btn btn-outline" onClick={() => setConfirm(true)}>Générer de nouveaux codes</button>

            {codes && (
                <div role="status" className="card" style={{ padding: '16px', marginTop: '16px' }}>
                    <p><strong>Notez ces codes maintenant : ils ne seront plus affichés.</strong> Les anciens codes ne fonctionnent plus.</p>
                    <ul style={{ fontFamily: 'monospace', fontSize: '1.05rem', columns: 2, margin: '10px 0' }}>
                        {codes.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-outline" onClick={() => window.print()}><Printer size={16} /> Imprimer</button>
                        <button className="btn btn-primary" onClick={() => setCodes(null)}>J’ai noté mes codes</button>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={confirm}
                title="Générer de nouveaux codes ?"
                message="Les codes actuels cesseront de fonctionner."
                confirmLabel="Générer"
                danger
                onConfirm={generate}
                onCancel={() => setConfirm(false)}
            />
        </div>
    );
}

// Devices where the account is signed in, with a way to close them
export function SessionsCard() {
    const toast = useToast();
    const router = useRouter();
    const [sessions, setSessions] = useState(null);
    const [confirm, setConfirm] = useState(false);

    const load = useCallback(() => api('/api/account/sessions').then(setSessions).catch((e) => toast.error(e.message)), [toast]);
    useEffect(() => { load(); }, [load]);

    const close = async (s) => {
        try {
            await api(`/api/account/sessions/${s.id}`, { method: 'DELETE' });
            if (s.current) { router.push('/login'); return; }
            load();
        } catch (e) { toast.error(e.message); }
    };

    const closeOthers = async () => {
        setConfirm(false);
        try {
            await api('/api/account/sessions', { method: 'POST', body: { action: 'revoke-others' } });
            toast.success('Les autres appareils ont été déconnectés');
            load();
        } catch (e) { toast.error(e.message); }
    };

    return (
        <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><MonitorSmartphone size={20} /> Sessions actives</h3>
            {!sessions && <p className="text-muted">Chargement…</p>}
            {sessions && sessions.length === 0 && <p className="text-muted">Aucune session active.</p>}
            {sessions && sessions.map((s) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.9rem' }}>
                        <div>{shortAgent(s.userAgent)} {s.current && <span className="badge badge-primary">cet appareil</span>}</div>
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                            IP {s.ip || '—'} · dernière activité {new Date(s.lastSeenAt).toLocaleString('fr-FR')}
                        </div>
                    </div>
                    <button className="btn btn-outline btn-sm" onClick={() => close(s)} aria-label={s.current ? 'Se déconnecter' : 'Fermer cette session'}>
                        <LogOut size={14} /> {s.current ? 'Se déconnecter' : 'Fermer'}
                    </button>
                </div>
            ))}
            {sessions && sessions.length > 1 && (
                <button className="btn btn-outline" style={{ marginTop: '14px' }} onClick={() => setConfirm(true)}>Déconnecter les autres appareils</button>
            )}
            <ConfirmDialog
                open={confirm}
                title="Déconnecter les autres appareils ?"
                message="Les autres sessions seront fermées. Cet appareil reste connecté."
                confirmLabel="Déconnecter"
                danger
                onConfirm={closeOthers}
                onCancel={() => setConfirm(false)}
            />
        </div>
    );
}

// "Mozilla/5.0 (Windows NT 10.0…) Chrome/120" -> "Navigateur Chrome sur Windows" (best effort)
function shortAgent(ua) {
    if (!ua) return 'Appareil inconnu';
    const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return os ? `${browser} sur ${os}` : browser;
}
