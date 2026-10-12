'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trash2, Plus, CalendarCheck } from 'lucide-react';
import { useToast } from '@/components/Toast';
import ConfirmDialog from '@/components/ConfirmDialog';
import { api } from '@/lib/client';

// Classes and school years. A class belongs to one school year; grades and attendance follow the current year.
export default function AdminClasses() {
    const toast = useToast();
    const [data, setData] = useState({ classList: [], schoolYear: null });
    const [teachers, setTeachers] = useState([]);
    const [years, setYears] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newClass, setNewClass] = useState({ name: '', level: '', headTeacherId: '' });
    const [newYear, setNewYear] = useState({ startYear: '', copyClassesFrom: '' });
    const [confirm, setConfirm] = useState(null);

    const load = useCallback(() => Promise.all([
        api('/api/classes').then(setData),
        api('/api/school-years').then(setYears),
        api('/api/teachers').then(setTeachers).catch(() => {}),
    ]).catch((e) => toast.error(e.message)).finally(() => setLoading(false)), [toast]);

    useEffect(() => { load(); }, [load]);

    const run = async (fn, okMessage) => {
        try {
            await fn();
            if (okMessage) toast.success(okMessage);
            load();
        } catch (e) {
            toast.error(e.message);
        }
    };

    const addClass = (e) => {
        e.preventDefault();
        run(async () => {
            await api('/api/classes', { method: 'POST', body: { ...newClass, headTeacherId: newClass.headTeacherId || null } });
            setNewClass({ name: '', level: '', headTeacherId: '' });
        }, 'Classe créée');
    };

    const updateClass = (c, patch) => run(() => api(`/api/classes/${c.id}`, {
        method: 'PUT',
        body: { name: c.name, level: c.level || '', headTeacherId: c.headTeacherId, ...patch },
    }));

    const addYear = (e) => {
        e.preventDefault();
        run(async () => {
            await api('/api/school-years', {
                method: 'POST',
                body: { startYear: Number(newYear.startYear), copyClassesFrom: newYear.copyClassesFrom ? Number(newYear.copyClassesFrom) : undefined },
            });
            setNewYear({ startYear: '', copyClassesFrom: '' });
        }, 'Année scolaire créée');
    };

    const runConfirm = async () => {
        const { type, item } = confirm;
        setConfirm(null);
        if (type === 'class') await run(() => api(`/api/classes/${item.id}`, { method: 'DELETE' }), 'Classe supprimée');
        if (type === 'year') await run(() => api(`/api/school-years/${item.id}`, { method: 'DELETE' }), 'Année supprimée');
    };

    if (loading) return <div className="loading-page"><div className="spinner" /></div>;

    const current = data.schoolYear;

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Classes et années scolaires</h1>
                    <p className="page-subtitle">Année en cours : <strong>{current?.label || 'aucune'}</strong></p>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h2 className="card-title">Classes de l&apos;année {current?.label}</h2>
                {!current && <p>Créez d&apos;abord une année scolaire.</p>}
                {current && (
                    <>
                        <form onSubmit={addClass} className="form-row" style={{ alignItems: 'flex-end', marginBottom: '1rem' }}>
                            <div className="form-group">
                                <label>Nom</label>
                                <input required maxLength={50} placeholder="6e A" value={newClass.name} onChange={e => setNewClass({ ...newClass, name: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Niveau</label>
                                <input maxLength={30} placeholder="6e" value={newClass.level} onChange={e => setNewClass({ ...newClass, level: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Professeur principal</label>
                                <select value={newClass.headTeacherId} onChange={e => setNewClass({ ...newClass, headTeacherId: e.target.value })}>
                                    <option value="">—</option>
                                    {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                                </select>
                            </div>
                            <button className="btn btn-primary" type="submit"><Plus size={16} /> Ajouter</button>
                        </form>
                        <div className="table-container">
                            <table>
                                <thead><tr><th>Nom</th><th>Niveau</th><th>Professeur principal</th><th>Élèves</th><th></th></tr></thead>
                                <tbody>
                                    {data.classList.length === 0 && <tr><td colSpan={5}>Aucune classe pour cette année.</td></tr>}
                                    {data.classList.map(c => (
                                        <tr key={c.id}>
                                            <td>
                                                <input defaultValue={c.name} maxLength={50} aria-label="Nom de la classe"
                                                    onBlur={e => e.target.value.trim() && e.target.value !== c.name && updateClass(c, { name: e.target.value.trim() })} />
                                            </td>
                                            <td>
                                                <input defaultValue={c.level || ''} maxLength={30} aria-label="Niveau"
                                                    onBlur={e => e.target.value !== (c.level || '') && updateClass(c, { level: e.target.value })} />
                                            </td>
                                            <td>
                                                <select aria-label="Professeur principal" value={c.headTeacherId || ''}
                                                    onChange={e => updateClass(c, { headTeacherId: e.target.value ? Number(e.target.value) : null })}>
                                                    <option value="">—</option>
                                                    {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                                                </select>
                                            </td>
                                            <td>{c.studentCount}</td>
                                            <td>
                                                <button className="btn btn-outline" title="Supprimer la classe" aria-label={`Supprimer ${c.name}`}
                                                    onClick={() => setConfirm({ type: 'class', item: c, message: `Supprimer la classe ${c.name} ?` })}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            <div className="card">
                <h2 className="card-title">Années scolaires</h2>
                <form onSubmit={addYear} className="form-row" style={{ alignItems: 'flex-end', marginBottom: '1rem' }}>
                    <div className="form-group">
                        <label>Année de rentrée</label>
                        <input type="number" required min={2000} max={2100} placeholder="2027" value={newYear.startYear} onChange={e => setNewYear({ ...newYear, startYear: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label>Copier les classes de</label>
                        <select value={newYear.copyClassesFrom} onChange={e => setNewYear({ ...newYear, copyClassesFrom: e.target.value })}>
                            <option value="">—</option>
                            {years.map(y => <option key={y.id} value={y.id}>{y.label}</option>)}
                        </select>
                    </div>
                    <button className="btn btn-primary" type="submit"><Plus size={16} /> Créer l&apos;année</button>
                </form>
                <div className="table-container">
                    <table>
                        <thead><tr><th>Année</th><th>Période</th><th>Trimestres</th><th>Classes</th><th></th></tr></thead>
                        <tbody>
                            {years.map(y => (
                                <tr key={y.id}>
                                    <td>{y.label} {y.isCurrent && <span className="badge badge-primary">en cours</span>}</td>
                                    <td>{String(y.startsOn).slice(0, 10)} → {String(y.endsOn).slice(0, 10)}</td>
                                    <td>{y.terms.map(t => t.name).join(', ')}</td>
                                    <td>{y.classCount}</td>
                                    <td style={{ display: 'flex', gap: '.5rem' }}>
                                        {!y.isCurrent && (
                                            <button className="btn btn-outline" onClick={() => run(() => api(`/api/school-years/${y.id}`, { method: 'PATCH', body: { isCurrent: true } }), 'Année en cours mise à jour')}>
                                                <CalendarCheck size={16} /> Définir comme en cours
                                            </button>
                                        )}
                                        {!y.isCurrent && (
                                            <button className="btn btn-outline" aria-label={`Supprimer ${y.label}`} onClick={() => setConfirm({ type: 'year', item: y, message: `Supprimer l'année ${y.label} ?` })}>
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <ConfirmDialog
                open={!!confirm}
                message={confirm?.message}
                onConfirm={runConfirm}
                onCancel={() => setConfirm(null)}
            />
        </div>
    );
}
