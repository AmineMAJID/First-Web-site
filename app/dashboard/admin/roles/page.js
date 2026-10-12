'use client';

// Roles and permissions: create roles and switch each feature on or off for each role.
// Changes apply immediately to the pages and the API (permissions are read on every request).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, Plus, Save, Trash2, Lock, Users as UsersIcon } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useToast } from '@/components/Toast';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { api } from '@/lib/client';

const UI = {
    fr: {
        title: 'Rôles et permissions', subtitle: 'Créez des rôles et choisissez, pour chacun, les fonctionnalités accessibles. Les changements s’appliquent immédiatement.',
        newRole: 'Nouveau rôle', roles: 'Rôles', builtIn: 'Rôle système', custom: 'Rôle personnalisé', accounts: 'comptes',
        name: 'Nom du rôle', requires2fa: 'Double authentification obligatoire', save: 'Enregistrer', saved: 'Rôle enregistré',
        remove: 'Supprimer le rôle', removeConfirm: 'Supprimer ce rôle ? Cette action est définitive.', removed: 'Rôle supprimé',
        locked: 'Rôle verrouillé', lockedNote: 'Le rôle administrateur possède toutes les fonctionnalités réservées et ne peut pas être modifié.',
        adminOnly: 'Réservé à l’administrateur', alwaysOn: 'Toujours actif', permissions: 'Permissions',
        create: 'Créer le rôle', created: 'Rôle créé', createTitle: 'Nouveau rôle', selectRole: 'Sélectionnez un rôle.',
        unsaved: 'Modifications non enregistrées', inUse: 'Ce rôle est encore attribué à des comptes.',
        cancel: 'Annuler', staffLink: 'Gérer les comptes du staff', hint: 'Les rôles système (enseignant, élève) gardent leur identifiant. Vous pouvez changer leur nom et leurs permissions.',
    },
    en: {
        title: 'Roles and permissions', subtitle: 'Create roles and choose which features each role can use. Changes apply immediately.',
        newRole: 'New role', roles: 'Roles', builtIn: 'Built-in role', custom: 'Custom role', accounts: 'accounts',
        name: 'Role name', requires2fa: 'Two-factor authentication required', save: 'Save', saved: 'Role saved',
        remove: 'Delete role', removeConfirm: 'Delete this role? This cannot be undone.', removed: 'Role deleted',
        locked: 'Locked role', lockedNote: 'The administrator role holds every reserved feature and cannot be edited.',
        adminOnly: 'Administrator only', alwaysOn: 'Always on', permissions: 'Permissions',
        create: 'Create role', created: 'Role created', createTitle: 'New role', selectRole: 'Select a role.',
        unsaved: 'Unsaved changes', inUse: 'This role is still assigned to accounts.',
        cancel: 'Cancel', staffLink: 'Manage staff accounts', hint: 'Built-in roles (teacher, student) keep their identifier. You can change their name and permissions.',
    },
    ar: {
        title: 'الأدوار والصلاحيات', subtitle: 'أنشئ أدوارًا واختر لكل دور الميزات المتاحة. تُطبَّق التغييرات فورًا.',
        newRole: 'دور جديد', roles: 'الأدوار', builtIn: 'دور نظامي', custom: 'دور مخصص', accounts: 'حسابات',
        name: 'اسم الدور', requires2fa: 'المصادقة الثنائية إلزامية', save: 'حفظ', saved: 'تم حفظ الدور',
        remove: 'حذف الدور', removeConfirm: 'هل تريد حذف هذا الدور؟ لا يمكن التراجع.', removed: 'تم حذف الدور',
        locked: 'دور مقفل', lockedNote: 'دور المسؤول يملك جميع الميزات المحجوزة ولا يمكن تعديله.',
        adminOnly: 'للمسؤول فقط', alwaysOn: 'مفعّل دائمًا', permissions: 'الصلاحيات',
        create: 'إنشاء الدور', created: 'تم إنشاء الدور', createTitle: 'دور جديد', selectRole: 'اختر دورًا.',
        unsaved: 'تغييرات غير محفوظة', inUse: 'ما زال هذا الدور مسندًا إلى حسابات.',
        cancel: 'إلغاء', staffLink: 'إدارة حسابات الموظفين', hint: 'تحتفظ الأدوار النظامية (أستاذ، طالب) بمعرّفها. يمكنك تغيير اسمها وصلاحياتها.',
    },
};

const GROUPS = {
    dashboard: { fr: 'Accueil', en: 'Home', ar: 'الرئيسية' },
    administration: { fr: 'Administration', en: 'Administration', ar: 'الإدارة' },
    students: { fr: 'Élèves', en: 'Students', ar: 'الطلاب' },
    teachers: { fr: 'Enseignants', en: 'Teachers', ar: 'الأساتذة' },
    grades: { fr: 'Notes', en: 'Grades', ar: 'النقاط' },
    attendance: { fr: 'Présences', en: 'Attendance', ar: 'الحضور' },
    schedule: { fr: 'Emploi du temps', en: 'Timetable', ar: 'الجدول الزمني' },
    messages: { fr: 'Messagerie', en: 'Messages', ar: 'الرسائل' },
    account: { fr: 'Compte', en: 'Account', ar: 'الحساب' },
    family: { fr: 'Famille', en: 'Family', ar: 'الأسرة' },
};

const pick = (obj, lang) => obj?.[lang] || obj?.fr || '';

export default function AdminRoles() {
    const { language } = useLanguage();
    const toast = useToast();
    const s = UI[language] || UI.fr;

    const [data, setData] = useState({ roles: [], features: [] });
    const [selectedKey, setSelectedKey] = useState(null);
    const [draft, setDraft] = useState(null); // { label, requiresTwoFactor, permissions:Set }
    const [saving, setSaving] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [newRole, setNewRole] = useState({ label: '', requiresTwoFactor: true });
    const [confirmDelete, setConfirmDelete] = useState(false);

    const load = useCallback(() => api('/api/roles').then((d) => {
        setData(d);
        return d;
    }).catch((e) => toast.error(e.message)), [toast]);

    useEffect(() => {
        load().then((d) => { if (d && !selectedKey && d.roles[0]) setSelectedKey(d.roles[0].key); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const role = useMemo(() => data.roles.find((r) => r.key === selectedKey) || null, [data.roles, selectedKey]);

    // Reset the editor whenever another role is selected or reloaded from the server
    useEffect(() => {
        if (!role) { setDraft(null); return; }
        setDraft({ label: role.label, requiresTwoFactor: role.requiresTwoFactor, permissions: new Set(role.permissions) });
    }, [role]);

    const dirty = useMemo(() => {
        if (!role || !draft || role.locked) return false;
        const base = new Set(role.permissions);
        const sameSet = base.size === draft.permissions.size && [...base].every((k) => draft.permissions.has(k));
        return draft.label !== role.label || draft.requiresTwoFactor !== role.requiresTwoFactor || !sameSet;
    }, [role, draft]);

    const toggle = (key) => setDraft((d) => {
        const next = new Set(d.permissions);
        if (next.has(key)) next.delete(key); else next.add(key);
        return { ...d, permissions: next };
    });

    const handleSave = async () => {
        setSaving(true);
        try {
            const permissions = [...draft.permissions].filter((k) => data.features.find((f) => f.key === k && !f.locked && !f.alwaysOn));
            await api(`/api/roles/${role.key}`, { method: 'PUT', body: { label: draft.label, requiresTwoFactor: draft.requiresTwoFactor, permissions } });
            toast.success(s.saved);
            await load();
        } catch (e) { toast.error(e.message); } finally { setSaving(false); }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            const res = await api('/api/roles', { method: 'POST', body: { label: newRole.label, requiresTwoFactor: newRole.requiresTwoFactor, permissions: [] } });
            toast.success(s.created);
            setCreateOpen(false);
            setNewRole({ label: '', requiresTwoFactor: true });
            await load();
            setSelectedKey(res.key);
        } catch (err) { toast.error(err.message); }
    };

    const handleDelete = async () => {
        setConfirmDelete(false);
        try {
            await api(`/api/roles/${role.key}`, { method: 'DELETE' });
            toast.success(s.removed);
            setSelectedKey(null);
            await load();
        } catch (err) { toast.error(err.message); }
    };

    // Feature rows visible for the selected role, grouped
    const groupedRows = useMemo(() => {
        if (!role) return [];
        const visible = data.features.filter((f) => !f.excludeRoles.includes(role.key));
        const groups = new Map();
        for (const f of visible) {
            if (!groups.has(f.group)) groups.set(f.group, []);
            groups.get(f.group).push(f);
        }
        return [...groups.entries()];
    }, [role, data.features]);

    return (
        <div className="animate-fade-in">
            <div className="card" style={{ padding: '16px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Shield size={20} color="#8b5cf6" /> {s.title}</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{s.subtitle}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <a className="btn btn-outline" href="/dashboard/admin/staff"><UsersIcon size={16} /> {s.staffLink}</a>
                    <button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> {s.newRole}</button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: '20px', alignItems: 'start' }} className="roles-layout">
                <div className="card" style={{ padding: '12px' }}>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '4px 8px 10px' }}>{s.roles}</p>
                    {data.roles.map((r) => (
                        <button key={r.key} onClick={() => setSelectedKey(r.key)}
                            className="btn btn-outline"
                            style={{ width: '100%', justifyContent: 'space-between', marginBottom: '6px', background: selectedKey === r.key ? 'var(--primary-50)' : undefined, borderColor: selectedKey === r.key ? 'var(--primary-300)' : undefined }}>
                            <span style={{ textAlign: 'start' }}>
                                <strong style={{ display: 'block' }}>{r.label}</strong>
                                <small style={{ color: 'var(--text-muted)' }}>{r.isSystem ? s.builtIn : s.custom} · {r.userCount} {s.accounts}</small>
                            </span>
                            {r.locked && <Lock size={14} />}
                        </button>
                    ))}
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '8px' }}>{s.hint}</p>
                </div>

                <div>
                    {!role || !draft ? (
                        <div className="card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>{s.selectRole}</div>
                    ) : (
                        <div className="card" style={{ padding: '20px' }}>
                            <div className="form-row" style={{ alignItems: 'flex-end' }}>
                                <div className="form-group">
                                    <label>{s.name}</label>
                                    <input value={draft.label} disabled={role.locked} maxLength={60} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input type="checkbox" checked={draft.requiresTwoFactor} disabled={role.locked}
                                            onChange={(e) => setDraft({ ...draft, requiresTwoFactor: e.target.checked })} /> {s.requires2fa}
                                    </label>
                                </div>
                            </div>

                            {role.locked && <p style={{ background: 'var(--primary-50)', padding: '10px 12px', borderRadius: '10px', fontSize: '0.85rem', marginBottom: '14px' }}><Lock size={14} /> {s.lockedNote}</p>}

                            <h4 style={{ margin: '8px 0 12px' }}>{s.permissions}</h4>
                            {groupedRows.map(([group, rows]) => (
                                <div key={group} style={{ marginBottom: '14px' }}>
                                    <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>{pick(GROUPS[group], language)}</p>
                                    {rows.map((f) => {
                                        const adminOnly = f.locked === 'admin' && !role.locked;
                                        const checked = role.locked ? role.permissions.includes(f.key) : draft.permissions.has(f.key);
                                        const disabled = role.locked || f.alwaysOn || adminOnly;
                                        return (
                                            <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '10px', background: 'var(--bg-hover)', marginBottom: '6px', cursor: disabled ? 'default' : 'pointer', opacity: adminOnly ? 0.6 : 1 }}>
                                                <input type="checkbox" checked={checked || f.alwaysOn} disabled={disabled} onChange={() => toggle(f.key)} />
                                                <span style={{ flex: 1 }}>{pick(f.label, language)}</span>
                                                {f.alwaysOn && <small style={{ color: 'var(--text-muted)' }}>{s.alwaysOn}</small>}
                                                {adminOnly && <small style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}><Lock size={12} /> {s.adminOnly}</small>}
                                            </label>
                                        );
                                    })}
                                </div>
                            ))}

                            {!role.locked && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                                    <div>
                                        {dirty && <small style={{ color: '#f59e0b' }}>{s.unsaved}</small>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {!role.isSystem && (
                                            <button className="btn btn-outline" style={{ color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => setConfirmDelete(true)} disabled={role.userCount > 0} title={role.userCount > 0 ? s.inUse : undefined}>
                                                <Trash2 size={16} /> {s.remove}
                                            </button>
                                        )}
                                        <button className="btn btn-primary" onClick={handleSave} disabled={!dirty || saving}><Save size={16} /> {s.save}</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={s.createTitle}>
                <form onSubmit={handleCreate}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label>{s.name} *</label>
                            <input required maxLength={60} value={newRole.label} onChange={(e) => setNewRole({ ...newRole, label: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="checkbox" checked={newRole.requiresTwoFactor} onChange={(e) => setNewRole({ ...newRole, requiresTwoFactor: e.target.checked })} /> {s.requires2fa}
                            </label>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline" onClick={() => setCreateOpen(false)}>{s.cancel}</button>
                        <button type="submit" className="btn btn-primary">{s.create}</button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog open={confirmDelete} danger title={s.remove} message={s.removeConfirm} confirmLabel={s.remove}
                onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)} />
        </div>
    );
}
