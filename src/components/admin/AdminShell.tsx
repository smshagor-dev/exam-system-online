'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ComponentType, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import SignOutButton from '@/components/auth/SignOutButton'
import {
  BarChart3,
  BookOpen,
  CalendarRange,
  CalendarDays,
  GraduationCap,
  Languages,
  Layers3,
  Menu,
  School2,
  ScrollText,
  UserSquare2,
  Users,
  X,
} from 'lucide-react'

type AdminShellProps = {
  children: ReactNode
  user: {
    name: string
    email: string
    role: string
  }
}

type NavItem = {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/admin/departments', label: 'Departments', icon: School2 },
  { href: '/admin/subjects', label: 'Subjects', icon: BookOpen },
  { href: '/admin/teachers', label: 'Teachers', icon: UserSquare2 },
  { href: '/admin/students', label: 'Students', icon: GraduationCap },
  { href: '/admin/exams', label: 'Exams', icon: ScrollText },
  { href: '/admin/results', label: 'Results', icon: Users },
]

const superAdminOnlyNavItems: NavItem[] = [
  { href: '/admin/languages', label: 'Languages', icon: Languages },
  { href: '/admin/groups', label: 'Groups', icon: Layers3 },
  { href: '/admin/years', label: 'Academic Years', icon: CalendarRange },
  { href: '/admin/semesters', label: 'Semesters', icon: CalendarDays },
]

export default function AdminShell({ children, user }: AdminShellProps) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const items = user.role === 'SUPER_ADMIN' ? [...navItems, ...superAdminOnlyNavItems] : navItems

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  useEffect(() => {
    const openSidebar = () => setSidebarOpen(true)
    window.addEventListener('admin-sidebar-open', openSidebar)

    return () => window.removeEventListener('admin-sidebar-open', openSidebar)
  }, [])

  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      <div className="flex min-h-screen">
        <div
          className={`fixed inset-0 z-40 bg-slate-950/45 transition-opacity lg:hidden ${
            sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={() => setSidebarOpen(false)}
        />

        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col bg-[#0d1b3d] text-white transition-transform duration-300 lg:static lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1d4ed8] text-sm font-semibold shadow-lg shadow-blue-950/30">
                EMS
              </div>
              <div>
                <p className="font-semibold tracking-wide text-white">Exam Management</p>
                <p className="text-xs text-slate-300">Administration Panel</p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-4 py-5 lg:hidden">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200"
            >
              <Menu className="h-4 w-4" />
              Menu
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 pb-6">
            <div className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Main Menu
            </div>
            <div className="space-y-1.5">
              {items.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-[#1d4ed8] text-white shadow-lg shadow-blue-950/20'
                        : 'text-slate-300 hover:bg-white/8 hover:text-white'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </nav>

          <div className="border-t border-white/10 px-4 py-5">
            <div className="rounded-2xl bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1d4ed8] text-sm font-semibold text-white">
                  {user.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                  <p className="truncate text-xs text-slate-300">{user.email}</p>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-300">
                {user.role.replace('_', ' ')}
              </div>
              <div className="mt-3">
                <SignOutButton
                  className="w-full rounded-xl border border-white/10 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10"
                >
                  Sign out
                </SignOutButton>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto max-w-[1400px]">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
