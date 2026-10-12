'use client';

// Staff management: accounts that hold a custom role (e.g. a supervisor). Administrator only.
// Their pages and features follow the permissions of their role (see the Roles page).
import { useCallback, useEffect, useState } from 'react';
import { UserCog, UserPlus, Edit3, KeyRound, ShieldOff, Trash2, Copy, Check, Shield } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useToast } from '@/components/Toast';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { api } from '@/lib/client';

const UI = {
    fr: {
        title: 'Gestion du staff', subtitle: 'Comptes du personnel (surveillants, secrétariat…). Chaque compte reçoit les pages et fonctionnalités de son rôle.',
        add: 'Ajouter un membre', name: 'Nom complet', email: 'E-mail', role: 'Rôle', noRoles: 'Aucun rôle personnalisé. Créez-en un d’abord.',
        manageRoles: 'Gérer les rôles', empty: 'Aucun membre du staff pour le moment.', username: 'Identifiant',
        twoFa: 'Double authentification', on: 'Activée', off: 'Non configurée', pending: 'Mot de passe à changer',
        actions: 'Actions', edit: 'Modifier', resetPwd: 'Réinitialiser le mot de passe', reset2fa: 'Réinitialiser la 2FA', remove: 'Supprimer',
        confirmReset: 'Générer un nouveau mot de passe temporaire ? Les sessions de ce compte seront fermées.',
        confirmReset2fa: 'Retirer la double authentification ? Le membre devra en configurer une nouvelle.',
        confirmRemove: 'Supprimer ce compte ? Cette action est définitive.',
        created: 'Compte créé', credsTitle: 'Identifiants temporaires', credsNote: 'Notez-les maintenant : le mot de passe ne sera plus affiché.',
        copy: 'Copier', copied: 'Copié', saved: 'Enregistré', cancel: 'Annuler', save: 'Enregistrer', create: 'Créer le compte',
        newPwd: 'Nouveau mot de passe temporaire', close: 'Fermer', editTitle: 'Modifier le membre', createTitle: 'Nouveau membre du staff',
    },
    en: {
        title: 'Staff management', subtitle: 'Staff accounts (supervisors, administrative staff…). Each account gets the pages and features of its role.',
        add: 'Add staff member', name: 'Full name', email: 'Email', role: 'Role', noRoles: 'No custom role yet. Create one first.',
        manageRoles: 'Manage roles', empty: 'No staff members yet.', username: 'Username',
        twoFa: 'Two-factor authentication', on: 'Enabled', off: 'Not set up', pending: 'Password change required',
        actions: 'Actions', edit: 'Edit', resetPwd: 'Reset password', reset2fa: 'Reset 2FA', remove: 'Delete',
        confirmReset: 'Generate a new temporary password? This account’s sessions will be closed.',
        confirmReset2fa: 'Remove two-factor authentication? The member will have to set it up again.',
        confirmRemove: 'Delete this account? This cannot be undone.',
        created: 'Account created', credsTitle: 'Temporary credentials', credsNote: 'Write them down now: the password will not be shown again.',
        copy: 'Copy', copied: 'Copied', saved: 'Saved', cancel: 'Cancel', save: 'Save', create: 'Create account',
        newPwd: 'New temporary password', close: 'Close', editTitle: 'Edit member', createTitle: 'New staff member',
    },
    ar: {
        title: 'إدارة الموظفين', subtitle: 'حسابات الموظفين (المراقبون، الإدارة…). يحصل كل حساب على صفحات وميزات دوره.',
        add: 'إضافة موظف', name: 'الاسم الكامل', email: 'البريد الإلكتروني', role: 'الدور', noRoles: 'لا يوجد دور مخصص بعد. أنشئ دورًا أولًا.',
        manageRoles: 'إدارة الأدوار', empty: 'لا يوجد موظفون بعد.', username: 'اسم المستخدم',
        twoFa: 'المصادقة الثنائية', on: 'مفعّلة', off: 'غير مهيأة', pending: 'يجب تغيير كلمة المرور',
        actions: 'إجراءات', edit: 'تعديل', resetPwd: 'إعادة تعيين كلمة المرور', reset2fa: 'إعادة تعيين المصادقة الثنائية', remove: 'حذف',
        confirmReset: 'هل تريد إنشاء كلمة مرور مؤقتة جديدة؟ ستُغلق جلسات هذا الحساب.',
        confirmReset2fa: 'هل تريد إزالة المصادقة الثنائية؟ سيحتاج الموظف إلى إعدادها من جديد.',
        confirmRemove: 'هل تريد حذف هذا الحساب؟ لا يمكن التراجع.',
        created: 'تم إنشاء الحساب', credsTitle: 'بيانات الدخول المؤقتة', credsNote: 'اكتبها الآن: لن تُعرض كلمة المرور مرة أخرى.',
        copy: 'نسخ', copied: 'تم النسخ', saved: 'تم الحفظ', cancel: 'إلغاء', save: 'حفظ', create: 'إنشاء الحساب',
        newPwd: 'كلمة مرور مؤقتة جديدة', close: 'إغلاق', editTitle: 'تعديل الموظف', createTitle: 'موظف جديد',
    },
};

const EMPTY = { fullName: '', email: '', roleKey: '' };

export default function AdminStaff() {
    const { language } = useLanguage();
    const toast = useToast();
    const s = UI[language] || UI.fr;

    const [staff, setStaff] = useState([]);
    const [roles, setRoles] = useState([]); // custom roles only
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null); // null | 'new' | staff row
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [creds, setCreds] = useState(null); // { username, password, fullName }
    const [copied, setCopied] = useState(false);
    const [confirm, setConfirm] = useState(null); // { type, member }

    const load = useCallback(async () => {
        try {
            const [staffRows, roleData] = await Promise.all([api('/api/staff'), api('/api/roles')]);
            setStaff(staffRows);
            setRoles(roleData.roles.filter((r) => !r.isSystem));
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => {
        setEditing('new');
        setForm({ ...EMPTY, roleKey: roles[0]?.key || '' });
    };
    const openEdit = (m) => {
        setEditing(m);
        setForm({ fullName: m.fullName, email: m.email || '', roleKey: m.roleKey });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editing === 'new') {
                const data = await api('/api/staff', { method: 'POST', body: form });
                setEditing(null);
                setCreds({ username: data.staff.username, password: data.staff.password, fullName: data.staff.fullName });
            } else {
                await api(`/api/staff/${editing.id}`, { method: 'PUT', body: form });
                toast.success(s.saved);
                setEditing(null);
            }
            load();
        } catch (err) { toast.error(err.message); } finally { setSaving(false); }
    };

    const runConfirm = async () => {
        const { type, member } = confirm;
        setConfirm(null);
        try {
            if (type === 'remove') {
                await api(`/api/staff/${member.id}`, { method: 'DELETE' });
                toast.success(s.saved);
            } else {
                const action = type === 'reset-2fa' ? 'reset-2fa' : 'reset-password';
                const data = await api(`/api/staff/${member.id}`, { method: 'POST', body: { action } });
                if (data.password) setCreds({ username: member.username, password: data.password, fullName: member.fullName });
                else toast.success(s.saved);
            }
            load();
        } catch (err) { toast.error(err.message); }
    };

    const copyCreds = async () => {
        await navigator.clipboard.writeText(`${creds.username} / ${creds.password}`).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const confirmText = { 'reset-password': s.confirmReset, 'reset-2fa': s.confirmReset2fa, remove: s.confirmRemove };

    return (
        <div className="animate-fade-in">
            <div className="card" style={{ padding: '16px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><UserCog size={20} color="#8b5cf6" /> {s.title}</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{s.subtitle}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <a className="btn btn-outline" href="/dashboard/admin/roles"><Shield size={16} /> {s.manageRoles}</a>
                    <button className="btn btn-primary" onClick={openNew} disabled={roles.length === 0} title={roles.length === 0 ? s.noRoles : undefined}>
                        <UserPlus size={16} /> {s.add}
                    </button>
                </div>
            </div>

            <div className="card table-container">
                {loading ? (
                    <div className="loading-page"><div className="spinner" /></div>
                ) : staff.length === 0 ? (
                    <p style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>{s.empty}</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>{s.name}</th><th>{s.username}</th><th>{s.role}</th><th>{s.twoFa}</th><th>{s.actions}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {staff.map((m) => (
                                <tr key={m.id}>
                                    <td>
                                        <strong>{m.fullName}</strong>
                                        {m.mustChangePassword && <div><small style={{ color: '#f59e0b' }}>{s.pending}</small></div>}
                                    </td>
                                    <td><code>{m.username}</code></td>
                                    <td><span className="badge badge-purple">{m.roleLabel}</span></td>
                                    <td>{m.has2fa ? <span className="badge badge-success">{s.on}</span> : <span className="badge badge-warning">{s.off}</span>}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            <button className="btn btn-outline btn-sm" title={s.edit} onClick={() => openEdit(m)}><Edit3 size={14} /></button>
                                            <button className="btn btn-outline btn-sm" title={s.resetPwd} onClick={() => setConfirm({ type: 'reset-password', member: m })}><KeyRound size={14} /></button>
                                            <button className="btn btn-outline btn-sm" title={s.reset2fa} onClick={() => setConfirm({ type: 'reset-2fa', member: m })} disabled={!m.has2fa}><ShieldOff size={14} /></button>
                                            <button className="btn btn-outline btn-sm" title={s.remove} style={{ color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => setConfirm({ type: 'remove', member: m })}><Trash2 size={14} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? s.createTitle : s.editTitle}>
                <form onSubmit={handleSave}>
                    <div className="modal-body">
                        {roles.length === 0 && <p style={{ color: '#f59e0b', fontSize: '0.85rem' }}>{s.noRoles}</p>}
                        <div className="form-group">
                            <label>{s.name} *</label>
                            <input required maxLength={100} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>{s.email}</label>
                            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>{s.role} *</label>
                            <select required value={form.roleKey} onChange={(e) => setForm({ ...form, roleKey: e.target.value })}>
                                {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>{s.cancel}</button>
                        <button type="submit" className="btn btn-primary" disabled={saving || !form.roleKey}>{editing === 'new' ? s.create : s.save}</button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!creds} onClose={() => setCreds(null)} title={s.credsTitle}>
                {creds && (
                    <div className="modal-body" style={{ textAlign: 'center' }}>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{creds.fullName}</p>
                        <p><strong>{s.username}:</strong> <code>{creds.username}</code></p>
                        <p><strong>{s.newPwd}:</strong> <code>{creds.password}</code></p>
                        <p style={{ color: '#f59e0b', fontSize: '0.85rem' }}>{s.credsNote}</p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
                            <button className="btn btn-outline" onClick={copyCreds}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? s.copied : s.copy}</button>
                            <button className="btn btn-primary" onClick={() => setCreds(null)}>{s.close}</button>
                        </div>
                    </div>
                )}
            </Modal>

            <ConfirmDialog open={!!confirm} danger={confirm?.type === 'remove'} title={confirm ? (confirm.type === 'remove' ? s.remove : confirm.type === 'reset-2fa' ? s.reset2fa : s.resetPwd) : ''}
                message={confirm ? confirmText[confirm.type] : ''} confirmLabel={confirm ? (confirm.type === 'remove' ? s.remove : confirm.type === 'reset-2fa' ? s.reset2fa : s.resetPwd) : 'OK'} cancelLabel={s.cancel}
                onConfirm={runConfirm} onCancel={() => setConfirm(null)} />
        </div>
    );
}
