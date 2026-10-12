// Feature catalog and permission rules. Every feature of the application is listed here.
//   key            permission identifier stored in role_permissions
//   label          display name, per language
//   group          section used to group the matrix in the staff management page
//   nav            sidebar link (only shown when the user has the permission)
//   pages          URL prefixes guarded by this permission (exact = only that URL)
//   locked         'admin' => only the administrator role can hold it (never grantable)
//   excludeRoles   built-in roles that never get this feature (e.g. admin has no timetable)
//   alwaysOn       cannot be disabled (keeps every account able to manage its own password)

export const FEATURES = [
    { key: 'home.admin', group: 'dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard', ar: 'لوحة القيادة' }, nav: '/dashboard/admin', icon: 'LayoutDashboard', locked: 'admin', pages: [{ href: '/dashboard/admin', exact: true }] },
    { key: 'home.teacher', group: 'dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard', ar: 'لوحة القيادة' }, nav: '/dashboard/teacher', icon: 'LayoutDashboard', excludeRoles: ['admin'], pages: [{ href: '/dashboard/teacher', exact: true }] },
    { key: 'home.student', group: 'dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard', ar: 'لوحة القيادة' }, nav: '/dashboard/student', icon: 'LayoutDashboard', excludeRoles: ['admin'], pages: [{ href: '/dashboard/student', exact: true }] },

    { key: 'reports.view', group: 'administration', label: { fr: 'Rapports', en: 'Reports', ar: 'التقارير' }, nav: '/dashboard/admin/reports', icon: 'BarChart3', pages: [{ href: '/dashboard/admin/reports' }] },
    { key: 'staff.manage', group: 'administration', label: { fr: 'Gestion du staff', en: 'Staff management', ar: 'إدارة الموظفين' }, nav: '/dashboard/admin/staff', icon: 'UserCog', locked: 'admin', pages: [{ href: '/dashboard/admin/staff' }] },
    { key: 'roles.manage', group: 'administration', label: { fr: 'Rôles et permissions', en: 'Roles and permissions', ar: 'الأدوار والصلاحيات' }, nav: '/dashboard/admin/roles', icon: 'Shield', locked: 'admin', pages: [{ href: '/dashboard/admin/roles' }] },

    { key: 'students.view', group: 'students', label: { fr: 'Élèves', en: 'Students', ar: 'الطلاب' }, nav: '/dashboard/admin/students', icon: 'Users', pages: [{ href: '/dashboard/admin/students' }] },
    { key: 'students.manage', group: 'students', label: { fr: 'Ajouter, modifier, supprimer les élèves', en: 'Add, edit, delete students', ar: 'إضافة الطلاب وتعديلهم وحذفهم' }, pages: [] },
    { key: 'teachers.view', group: 'teachers', label: { fr: 'Enseignants', en: 'Teachers', ar: 'الأساتذة' }, nav: '/dashboard/admin/teachers', icon: 'GraduationCap', pages: [{ href: '/dashboard/admin/teachers' }] },
    { key: 'teachers.manage', group: 'teachers', label: { fr: 'Ajouter, modifier, supprimer les enseignants', en: 'Add, edit, delete teachers', ar: 'إضافة الأساتذة وتعديلهم وحذفهم' }, pages: [] },

    { key: 'grades.record', group: 'grades', label: { fr: 'Saisie des notes', en: 'Enter grades', ar: 'إدخال النقاط' }, nav: '/dashboard/teacher/grades', icon: 'BookOpen', excludeRoles: ['admin'], pages: [{ href: '/dashboard/teacher/grades' }] },
    { key: 'grades.view_all', group: 'grades', label: { fr: 'Consulter toutes les notes (lecture seule)', en: 'View all grades (read only)', ar: 'عرض جميع النقاط (للقراءة فقط)' }, pages: [] },
    { key: 'grades.view_own', group: 'grades', label: { fr: 'Mes notes', en: 'My grades', ar: 'نقاطي' }, nav: '/dashboard/student/grades', icon: 'BookOpen', excludeRoles: ['admin'], pages: [{ href: '/dashboard/student/grades' }] },
    { key: 'attendance.record', group: 'attendance', label: { fr: 'Saisie des présences', en: 'Record attendance', ar: 'تسجيل الحضور' }, nav: '/dashboard/teacher/attendance', icon: 'ClipboardCheck', excludeRoles: ['admin'], pages: [{ href: '/dashboard/teacher/attendance' }] },
    { key: 'attendance.view_all', group: 'attendance', label: { fr: 'Consulter toutes les présences (lecture seule)', en: 'View all attendance (read only)', ar: 'عرض جميع سجلات الحضور (للقراءة فقط)' }, pages: [] },
    { key: 'attendance.view_own', group: 'attendance', label: { fr: 'Mes présences', en: 'My attendance', ar: 'حضوري' }, nav: '/dashboard/student/attendance', icon: 'ClipboardCheck', excludeRoles: ['admin'], pages: [{ href: '/dashboard/student/attendance' }] },

    { key: 'schedule.view', group: 'schedule', label: { fr: 'Emploi du temps (consultation)', en: 'Timetable (view)', ar: 'الجدول الزمني (عرض)' }, nav: '/dashboard/schedule', icon: 'Calendar', excludeRoles: ['admin'], pages: [{ href: '/dashboard/schedule' }, { href: '/dashboard/teacher/schedule' }, { href: '/dashboard/student/schedule' }] },
    { key: 'schedule.manage', group: 'schedule', label: { fr: 'Gérer les emplois du temps', en: 'Manage timetables', ar: 'إدارة الجداول الزمنية' }, nav: '/dashboard/admin/schedule', icon: 'Calendar', excludeRoles: ['admin'], pages: [{ href: '/dashboard/admin/schedule' }] },

    { key: 'messages.view', group: 'messages', label: { fr: 'Messagerie', en: 'Messages', ar: 'الرسائل' }, nav: '/dashboard/messages', icon: 'MessageSquare', badge: true, pages: [{ href: '/dashboard/messages' }] },
    { key: 'messages.send', group: 'messages', label: { fr: 'Envoyer des messages et annonces', en: 'Send messages and announcements', ar: 'إرسال الرسائل والإعلانات' }, pages: [] },

    { key: 'account.settings', group: 'account', label: { fr: 'Paramètres du compte', en: 'Account settings', ar: 'إعدادات الحساب' }, nav: '/dashboard/settings', icon: 'Settings', alwaysOn: true, pages: [{ href: '/dashboard/settings' }] },
];

export const FEATURE_KEYS = new Set(FEATURES.map((f) => f.key));
export const LOCKED_KEYS = new Set(FEATURES.filter((f) => f.locked).map((f) => f.key));
export const BUILT_IN_ROLES = ['admin', 'teacher', 'student'];

// Permissions an account holds, given its role and the permissions granted to that role in the database
export function permissionsFor(roleKey, granted = []) {
    if (roleKey === 'admin') {
        return FEATURES.filter((f) => !f.excludeRoles?.includes('admin')).map((f) => f.key);
    }
    const set = new Set(granted.filter((k) => FEATURE_KEYS.has(k) && !LOCKED_KEYS.has(k)));
    for (const f of FEATURES) if (f.alwaysOn) set.add(f.key);
    return [...set];
}

// Grantable = a permission an admin can give to a non-admin role
export const isGrantable = (key) => FEATURE_KEYS.has(key) && !LOCKED_KEYS.has(key);

// Page the user lands on after login: first home page they can open, else the first feature with a page.
// Settings is always available, so there is always a landing page.
const LANDING_ORDER = ['home.admin', 'home.teacher', 'home.student'];
export function landingFor(perms) {
    const has = new Set(perms);
    for (const key of LANDING_ORDER) {
        const f = FEATURES.find((x) => x.key === key);
        if (f && has.has(key)) return f.pages[0].href;
    }
    const first = FEATURES.find((f) => f.nav && has.has(f.key));
    return first ? first.nav : '/dashboard/settings';
}

// Which feature guards a URL under /dashboard. Unknown URLs return null (denied).
export function featureForPath(pathname) {
    for (const f of FEATURES) {
        for (const p of f.pages) {
            if (p.exact ? pathname === p.href : pathname === p.href || pathname.startsWith(p.href + '/')) return f.key;
        }
    }
    return null;
}
