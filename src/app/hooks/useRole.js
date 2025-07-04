'use client';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';

export function useRole() {
  const { data: session } = useSession();
  const [role, setRole] = useState(null);

  useEffect(() => {
    async function fetchRole() {
      if (session?.user?.role) {
        setRole(session.user.role);
        return;
      }
      if (session?.user?.id || session?.user?.email || session?.user?.github_id) {
        const res = await fetch('/api/admin-management');
        const admins = await res.json();
        let userAdmin = null;
        if (session.user.id) {
          userAdmin = admins.find(admin => admin.id === session.user.id);
        } else if (session.user.email) {
          userAdmin = admins.find(admin => admin.email === session.user.email);
        } else if (session.user.github_id) {
          userAdmin = admins.find(admin => admin.github_id === session.user.github_id);
        }
        setRole(userAdmin?.role || null);
      }
    }
    fetchRole();
  }, [session]);

  return {
    role,
    isOwner: role === 'owner',
    isAdmin: role === 'admin' || role === 'owner',
    isViewer: role === 'viewer' || role === 'admin' || role === 'owner',
  };
} 