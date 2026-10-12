'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, ChevronRight } from 'lucide-react';
import { api, gradeColor } from '@/lib/client';

// Family home: one card per linked child (siblings are grouped here)
export default function ParentHome() {
    const [children, setChildren] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        api('/api/students/children').then(setChildren).catch((e) => setError(e.message));
    }, []);

    if (error) return <div className="card" style={{ padding: '24px', color: 'var(--danger-600)' }}>{error}</div>;
    if (!children) return <div className="loading-page"><div className="spinner" /></div>;

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Espace famille</h1>
                    <p className="page-subtitle">{children.length} enfant{children.length > 1 ? 's' : ''} lié{children.length > 1 ? 's' : ''} à votre compte</p>
                </div>
            </div>
            {children.length === 0 && <div className="card" style={{ padding: '24px' }}>Aucun élève n&apos;est lié à votre compte. Adressez-vous à l&apos;administration.</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                {children.map((c) => (
                    <Link key={c.id} href={`/dashboard/parent/children/${c.id}`} className="card" style={{ padding: '20px', textDecoration: 'none', color: 'inherit' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Users size={22} color="#8b5cf6" />
                            <div style={{ flex: 1 }}>
                                <strong>{c.full_name}</strong>
                                <div className="text-muted" style={{ fontSize: '0.85rem' }}>{c.class_name || 'Sans classe'} · {c.student_id}</div>
                            </div>
                            <ChevronRight size={18} />
                        </div>
                        <div style={{ display: 'flex', gap: '16px', marginTop: '14px' }}>
                            <div><div className="text-muted" style={{ fontSize: '0.8rem' }}>Moyenne</div><strong style={{ color: c.average != null ? gradeColor(c.average) : undefined }}>{c.average != null ? `${c.average}%` : '—'}</strong></div>
                            <div><div className="text-muted" style={{ fontSize: '0.8rem' }}>Présence</div><strong style={{ color: c.attendance_rate != null ? gradeColor(c.attendance_rate) : undefined }}>{c.attendance_rate != null ? `${c.attendance_rate}%` : '—'}</strong></div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
