'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { History, LayoutDashboard, LogOut, Tag, UserCog, Users } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';

const ROLE_LABEL: Record<string, string> = {
  registrar: 'Registrar',
  admin: 'Admin',
  superadmin: 'Superadmin',
};

const NAV: Array<{ href: string; label: string; icon: typeof LayoutDashboard; matchPrefix?: string }> = [
  { href: '/sis', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/sis/students', label: 'Students', icon: Users, matchPrefix: '/sis/students' },
  { href: '/sis/discount-codes', label: 'Discount Codes', icon: Tag, matchPrefix: '/sis/discount-codes' },
  { href: '/sis/audit-log', label: 'Audit Log', icon: History },
];

const ACTIVE_INDICATOR =
  'relative h-9 before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-r-full before:bg-brand-indigo before:opacity-0 before:transition-opacity data-[active=true]:before:opacity-100';

export function SisSidebar({ email, role }: { email: string; role: string }) {
  const router = useRouter();
  const pathname = usePathname();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  const initials =
    email
      .split('@')[0]
      .split(/[._-]/)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || 'SIS';

  function isActive(item: (typeof NAV)[number]): boolean {
    if (item.matchPrefix) return pathname === item.matchPrefix || pathname.startsWith(item.matchPrefix + '/');
    return pathname === item.href;
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <Link
          href="/sis"
          className="flex items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Image
            src="/hfse-logo-favicon.webp"
            alt=""
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-xl"
          />
          <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/60">
              HFSE
            </span>
            <span className="truncate font-serif text-base font-semibold tracking-tight text-sidebar-foreground">
              SIS
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1.5 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item)}
                      tooltip={item.label}
                      className={ACTIVE_INDICATOR}
                    >
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="mb-2 flex items-center gap-3 group-data-[collapsible=icon]:hidden">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-indigo to-brand-navy text-[11px] font-semibold text-white shadow-brand-tile">
            {initials}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div
              className="truncate text-xs font-medium text-sidebar-foreground"
              title={email}
            >
              {email}
            </div>
            <div className="mt-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/60">
              {ROLE_LABEL[role] ?? role}
            </div>
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname === '/account'}
              tooltip="Account"
              className={ACTIVE_INDICATOR}
            >
              <Link href="/account">
                <UserCog />
                <span>Account</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={signOut}
              tooltip="Sign out"
              className="h-9 text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
