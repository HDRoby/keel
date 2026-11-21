'use client';
// A sidebar link that marks itself as the current page.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function NavLink({ href, exact = false, children }: { href: string; exact?: boolean; children: ReactNode }) {
  const path = usePathname();
  const current = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return <Link href={href} className="nav-link" aria-current={current ? 'page' : undefined}>{children}</Link>;
}
