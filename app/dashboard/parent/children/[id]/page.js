'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import Timetable from '@/components/Timetable';
import { api, gradeColor } from '@/lib/client';

// One child: grades, attendance and timetable (read only)
export default function ChildPage() {
    const { id } = useParams();
    const [child, setChild] = useState(null);
    const [grades, setGrades] = useState([]);
    const [attendance, setAttendance] = useState([]);
    const [slots, setSlots] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        api('/api/students/children').then((list) => {
            const mine = list.find((c) => String(c.id) === String(id));
            if (!mine) throw new Error('Cet élève n’est pas lié à votre compte.');
            setChild(mine);
            return Promise.all([
                api(`/api/grades?studentId=${mine.id}`).then(setGrades),
                api(`/api/attendance?studentId=${mine.id}`).then(setAttendance),
                mine.class_name ? api(`/api/schedule?class=${encodeURIComponent(mine.class_name)}`).then(setSlots) : null,
            ]);
        }).catch((e) => setError(e.message));
    }, [id]);

    if (error) return <div className="card" style={{ padding: '24px', color: 'var(--danger-600)' }}>{error}</div>;
    if (!child) return <div className="loading-page"><div className="spinner" /></div>;

    return (
        <div className="animate-fade-in">
            <Link href="/dashboard/parent" className="btn btn-outline btn-sm" style={{ marginBottom: '16px' }}><ArrowLeft size={16} /> Retour</Link>
            <div className="page-header">
                <div>
                    <h1 className="page-title">{child.full_name}</h1>
                    <p className="page-subtitle">{child.class_name || 'Sans classe'} · {child.student_id}</p>
                </div>
            </div>

            <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
                <h2 className="card-title">Notes</h2>
                {grades.length === 0 ? <p className="text-muted">Aucune note pour l’instant.</p> : (
                    <div className="table-container"><table>
                        <thead><tr><th>Matière</th><th>Trimestre</th><th>Note</th><th>Remarque</th></tr></thead>
                        <tbody>{grades.map((g) => (
                            <tr key={g.id}>
                                <td>{g.subject}</td><td>{g.term}</td>
                                <td style={{ color: gradeColor((g.grade * 100) / g.max_grade) }}>{g.grade} / {g.max_grade}</td>
                                <td>{g.remarks || '—'}</td>
                            </tr>
                        ))}</tbody>
                    </table></div>
                )}
            </div>

            <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
                <h2 className="card-title">Présences</h2>
                {attendance.length === 0 ? <p className="text-muted">Aucune présence enregistrée.</p> : (
                    <div className="table-container"><table>
                        <thead><tr><th>Date</th><th>Statut</th><th>Note</th></tr></thead>
                        <tbody>{attendance.slice(0, 60).map((a) => (
                            <tr key={a.id}><td>{String(a.date).slice(0, 10)}</td><td>{a.status}</td><td>{a.notes || '—'}</td></tr>
                        ))}</tbody>
                    </table></div>
                )}
            </div>

            <div className="card" style={{ padding: '20px' }}>
                <h2 className="card-title">Emploi du temps</h2>
                {slots.length === 0 ? <p className="text-muted">Aucun créneau enregistré pour cette classe.</p> : <Timetable slots={slots} />}
            </div>
        </div>
    );
}
