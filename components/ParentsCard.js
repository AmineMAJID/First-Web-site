'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Link2, Unlink, Copy, Check } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/client';

// Parents (responsables) of one student: create a parent account, or link an existing one.
export default function ParentsCard({ studentId }) {
    const toast = useToast();
    const [parents, setParents] = useState([]);
    const [allParents, setAllParents] = useState([]);
    const [form, setForm] = useState({ fullName: '', email: '', relation: 'Parent' });
    const [linkId, setLinkId] = useState('');
    const [created, setCreated] = useState(null);
    const [copied, setCopied] = useState(false);

    const load = useCallback(() => {
        api(`/api/students/${studentId}/parents`).then(setParents).catch((e) => toast.error(e.message));
        api('/api/parents').then(setAllParents).catch(() => {});
    }, [studentId, toast]);

    useEffect(() => { load(); }, [load]);

    const create = async (e) => {
        e.preventDefault();
        try {
            const data = await api(`/api/students/${studentId}/parents`, { method: 'POST', body: form });
            setCreated(data.parent);
            setForm({ fullName: '', email: '', relation: 'Parent' });
            load();
        } catch (err) { toast.error(err.message); }
    };

    const link = async (e) => {
        e.preventDefault();
        if (!linkId) return;
        try {
            await api(`/api/students/${studentId}/parents`, { method: 'POST', body: { parentUserId: Number(linkId), relation: 'Parent' } });
            setLinkId('');
            load();
        } catch (err) { toast.error(err.message); }
    };

    const unlink = async (p) => {
        try {
            await api(`/api/students/${studentId}/parents?parentId=${p.userId}`, { method: 'DELETE' });
            load();
        } catch (err) { toast.error(err.message); }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(`${created.username}\n${created.password}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard unavailable */ }
    };

    const linkable = allParents.filter((p) => !parents.some((x) => x.userId === p.userId));

    return (
        <div className="card" style={{ padding: '20px', marginTop: '20px' }}>
            <h3 style={{ marginBottom: '14px' }}>Responsables (familles)</h3>

            {parents.length === 0 && <p className="text-muted">Aucun responsable lié à cet élève.</p>}
            {parents.map((p) => (
                <div key={p.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                        <strong>{p.full_name}</strong> <span className="text-muted">· {p.relation} · @{p.username}</span>
                        <div className="text-muted" style={{ fontSize: '0.85rem' }}>{p.email || 'pas d’e-mail'} · 2FA {p.has_2fa ? 'activée' : 'à activer'}</div>
                    </div>
                    <button className="btn btn-outline btn-sm" onClick={() => unlink(p)} aria-label={`Retirer ${p.full_name}`}><Unlink size={14} /> Retirer</button>
                </div>
            ))}

            {created && (
                <div className="card" role="status" style={{ padding: '12px', margin: '14px 0', background: 'var(--surface-2, #f8fafc)' }}>
                    <p>Compte créé pour <strong>{created.fullName}</strong>. Notez ces identifiants : le mot de passe ne sera plus affiché.</p>
                    <p>Identifiant : <code>{created.username}</code> · Mot de passe : <code>{created.password}</code></p>
                    <button className="btn btn-outline btn-sm" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} Copier</button>
                </div>
            )}

            <form onSubmit={create} style={{ display: 'grid', gap: '8px', marginTop: '14px' }}>
                <strong><UserPlus size={14} /> Ajouter un responsable</strong>
                <input required maxLength={100} placeholder="Nom complet" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />
                <input type="email" maxLength={120} placeholder="E-mail (facultatif)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                <input maxLength={40} placeholder="Lien (père, mère, tuteur…)" value={form.relation} onChange={e => setForm({ ...form, relation: e.target.value })} />
                <button className="btn btn-primary" type="submit">Créer le compte</button>
            </form>

            {linkable.length > 0 && (
                <form onSubmit={link} style={{ display: 'flex', gap: '8px', marginTop: '14px', alignItems: 'center' }}>
                    <select aria-label="Responsable existant" value={linkId} onChange={e => setLinkId(e.target.value)} style={{ flex: 1 }}>
                        <option value="">Lier un responsable existant…</option>
                        {linkable.map(p => <option key={p.userId} value={p.userId}>{p.full_name} ({p.children} enfant{p.children > 1 ? 's' : ''})</option>)}
                    </select>
                    <button className="btn btn-outline" type="submit"><Link2 size={14} /> Lier</button>
                </form>
            )}
        </div>
    );
}
