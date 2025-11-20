'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GearIcon } from '@radix-ui/react-icons';

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/urls', label: 'URLs' },
  { href: '/admin/stats', label: 'Stats' },
  { href: '/admin/users', label: 'Users' },
];

export default function AdminLayout({ children }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#dcdcdc] font-[Tahoma,_sans-serif]">
      <div className="px-3 py-4 space-y-4">
        <nav className="flex items-center justify-between gap-3 border border-[#303030] bg-[#141414] px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Link href="/admin/dashboard" className="flex items-center gap-2">
              <img src="https://serv.husky.nz/logo/default.png" alt="Husky" className="h-6 w-auto" />
              <GearIcon className="w-4 h-4" />
            </Link>
            Admin Console
          </div>
          <div className="flex items-center gap-2">
            {navItems.map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1 text-sm border ${
                    active ? 'border-[#4a4a4a] bg-[#1f1f1f]' : 'border-[#2d2d2d] bg-[#0f0f0f] text-[#c4c4c4]'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
        {children}
      </div>
    </div>
  );
}
