'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearToken ,getToken, getUserRole } from '../lib/auth';

const links = [
  { href: '/products', label: 'Shop' },
  { href: '/ai', label: 'AI Assistant' },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setLoggedIn(!!getToken());
      setRole(getUserRole());
    };
    sync();
    window.addEventListener('auth-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('auth-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, [pathname]);

  const handleSignOut = () => {
    clearToken();
    router.push('/login');
  };

  const isActive = (href: string) => pathname === href || (href !== '/' && pathname?.startsWith(href));

  const linkClass = (href: string) =>
    isActive(href) ? 'text-slate-100' : 'text-slate-300 transition hover:text-slate-100';

  return (
    <header className="sticky top-0 z-40 h-[88px] border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-slate-100">
          E-Commerce<span className="text-slate-500">.</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass(link.href)}>
              {link.label}
            </Link>
          ))}
          {loggedIn && (
            <Link href="/cart" className={linkClass('/cart')}>
              Cart
            </Link>
          )}
          {loggedIn && (
            <Link href="/orders" className={linkClass('/orders')}>
              Orders
            </Link>
          )}
          {loggedIn && role === 'admin' && (
            <Link href="/admin" className={linkClass('/admin')}>
              Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-4">
          {loggedIn ? (
            <>
              <Link href="/dashboard" className={`hidden text-sm font-medium sm:inline ${linkClass('/dashboard')}`}>
                Dashboard
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-white"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}