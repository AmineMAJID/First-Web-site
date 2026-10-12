'use client';

// Shared messaging page for any role that holds the messages.view permission
import Messaging from '@/components/Messaging';
import { useUser } from '../layout';

export default function Page() {
    const { user } = useUser();
    if (!user) return null;
    return <Messaging role={user.role} />;
}
