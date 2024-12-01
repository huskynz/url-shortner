'use client';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';

export function useRole() {
  const { data: session } = useSession();
  const [role, setRole] = useState(null);

  useEffect(() => {
    async function fetchRole() {
      if (session?.user?.username) {
        const res = await fetch('/api/admin-management');
        const admins = await res.json();
        const userAdmin = admins.find(admin => admin.github_username === session.user.username);
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