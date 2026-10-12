'use client';

// Shared timetable page for any role that holds the schedule.view permission.
// The content is scoped by the account: a student sees its class, a teacher its own lessons,
// and custom roles see the whole timetable.
import { useUser } from '../layout';
import StudentSchedule from '../student/schedule/page';
import TeacherSchedule from '../teacher/schedule/page';

export default function Page() {
    const { user } = useUser();
    if (!user) return null;
    return user.role === 'student' ? <StudentSchedule /> : <TeacherSchedule />;
}
