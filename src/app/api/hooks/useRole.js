'use client';
import { useUser } from '@clerk/nextjs';
import { useState, useEffect } from 'react';

export function useRole() {
  const { user, isLoaded } = useUser();
  const [role, setRole] = useState(null);

  useEffect(() => {
    async function fetchRole() {
      if (user?.username) {
        const res = await fetch('/api/admin-management');
        const admins = await res.json();
        const userAdmin = admins.find(admin => admin.github_username === user.username);
        setRole(userAdmin?.role || null);
      }
    }
    if (isLoaded) {
      fetchRole();
    }
  }, [user, isLoaded]);

  return {
    role,
    isOwner: role === 'owner',
    isAdmin: role === 'admin' || role === 'owner',
    isViewer: role === 'viewer' || role === 'admin' || role === 'owner',
  };
}