'use client'

import NotificationMenu from '@/components/account/NotificationMenu'
import SignOutButton from '@/components/auth/SignOutButton'
import BrandBadge from '@/components/branding/BrandBadge'
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher'
import { useI18n } from '@/components/i18n/LanguageProvider'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ComponentType, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  BarChart3,
  BookOpen,
  BookText,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronsUpDown,
  GraduationCap,
  Languages,
  Layers3,
  Menu,
  School2,
  ScrollText,
  Settings2,
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
    avatarUrl?: string | null
  }
  branding: {
    name: string
    shortName: string
    logoUrl?: string | null
  }
}

type NavItem = {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
}

type NavGroup = {
  label: string
  icon: ComponentType<{ className?: string }>
  items: NavItem[]
}

export default function AdminShell({ children, user, branding }: AdminShellProps) {
  const { t } = useI18n()
  const pathname = usePathname() ?? ''
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const navItems: NavItem[] = [
    { href: '/admin/dashboard', label: t('shell.dashboard', 'Dashboard'), icon: BarChart3 },
    { href: '/admin/departments', label: t('shell.departments', 'Departments'), icon: School2 },
    { href: '/admin/degree-levels', label: 'Degree Levels', icon: GraduationCap },
    { href: '/admin/programs', label: 'Programs', icon: School2 },
    { href: '/admin/department-languages', label: 'Department Languages', icon: Languages },
    { href: '/admin/academic-sessions', label: 'Academic Sessions', icon: CalendarRange },
    { href: '/admin/program-years', label: 'Program Years', icon: CalendarRange },
    { href: '/admin/program-semesters', label: 'Program Semesters', icon: CalendarDays },
    { href: '/admin/curriculum', label: 'Curriculum', icon: BookOpen },
    { href: '/admin/academic-offerings', label: 'Academic Offerings', icon: Layers3 },
    { href: '/admin/exam-calendar', label: 'Exam Calendar', icon: CalendarDays },
    { href: '/admin/exam-venues', label: 'Exam Venues', icon: School2 },
    { href: '/admin/exam-scheduling', label: 'Exam Scheduling', icon: CalendarRange },
    { href: '/admin/subjects', label: t('shell.subjects', 'Subjects'), icon: BookOpen },
    { href: '/admin/groups', label: t('shell.groups', 'Groups'), icon: Layers3 },
    { href: '/admin/years', label: t('shell.academic_years', 'Academic Years'), icon: CalendarRange },
    { href: '/admin/teachers', label: t('shell.teachers', 'Teachers'), icon: UserSquare2 },
    { href: '/admin/students', label: t('shell.students', 'Students'), icon: GraduationCap },
    { href: '/admin/exams', label: t('shell.exams', 'Exams'), icon: ScrollText },
    { href: '/admin/ebooks', label: 'Ebook Monitor', icon: BookText },
    { href: '/admin/results', label: t('shell.results', 'Results'), icon: Users },
    ...(user.role === 'SUPER_ADMIN'
      ? [{ href: '/admin/registration-form', label: t('common.registration_form', 'Registration Form'), icon: Settings2 }]
      : []),
  ]

  const systemSettingItems: NavItem[] = user.role === 'SUPER_ADMIN'
    ? [
        { href: '/admin/system-language', label: t('common.system_language', 'System Language'), icon: Languages },
        { href: '/admin/system-settings', label: t('common.system_settings_page', 'System Settings'), icon: Settings2 },
        { href: '/admin/smtp-setup', label: t('common.smtp_setup', 'SMTP Setup'), icon: Settings2 },
      ]
    : []

  const superAdminOnlyNavItems: NavItem[] = [
    { href: '/admin/languages', label: t('shell.languages', 'Languages'), icon: Languages },
    { href: '/admin/semesters', label: t('shell.semesters', 'Semesters'), icon: CalendarDays },
  ]

  const items = user.role === 'SUPER_ADMIN' ? [...navItems, ...superAdminOnlyNavItems] : navItems
  const systemSettings: NavGroup = {
    label: t('shell.system_settings', 'System Settings'),
    icon: Settings2,
    items: systemSettingItems,
  }
  const [settingsOpen, setSettingsOpen] = useState(
    systemSettings.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
  )
  const isSystemSettingsRoute = systemSettings.items.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  )

  useEffect(() => {
    setSidebarOpen(false)
    setProfileOpen(false)
  }, [pathname])

  useEffect(() => {
    const openSidebar = () => setSidebarOpen(true)
    window.addEventListener('admin-sidebar-open', openSidebar)
    return () => window.removeEventListener('admin-sidebar-open', openSidebar)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSidebarOpen(false)
      setProfileOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!sidebarOpen || !window.matchMedia('(max-width: 1023px)').matches) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [sidebarOpen])

  return (
    <div className="h-dvh overflow-hidden bg-[#f4f7fb]">
      <div className="flex h-full min-h-0 overflow-hidden">
        <button
          type="button"
          aria-label="Close navigation menu"
          className={`fixed inset-0 z-40 bg-slate-950/45 transition-opacity lg:hidden ${
            sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={() => setSidebarOpen(false)}
        />

        <aside
          id="admin-sidebar"
          aria-label="Administration navigation"
          className={`fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[272px] flex-col bg-[#0d1b3d] text-white shadow-2xl transition-transform duration-300 sm:w-[272px] lg:static lg:translate-x-0 lg:shadow-none ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-5 sm:px-6 sm:py-6">
            <BrandBadge
              name={branding.name}
              shortName={branding.shortName}
              logoUrl={branding.logoUrl}
              subtitle={t('shell.administration_panel', 'Administration Panel')}
              accentClassName="bg-[#1d4ed8] text-white shadow-blue-950/30"
            />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
            <div className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              {t('shell.main_menu', 'Main Menu')}
            </div>
            <div className="space-y-1.5">
              {items.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || (item.href !== '/admin/dashboard' && pathname.startsWith(`${item.href}/`))

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      setSidebarOpen(false)
                      setProfileOpen(false)
                    }}
                    className={`flex min-h-11 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-[#1d4ed8] text-white shadow-lg shadow-blue-950/20'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </Link>
                )
              })}

              {systemSettings.items.length > 0 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setSettingsOpen((current) => !current)}
                    className={`flex min-h-11 w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                      isSystemSettingsRoute
                        ? 'bg-white/10 text-white'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                    aria-expanded={settingsOpen || isSystemSettingsRoute}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <systemSettings.icon className="h-5 w-5 shrink-0" />
                      <span className="truncate">{systemSettings.label}</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {(settingsOpen || isSystemSettingsRoute) && (
                    <div className="mt-2 space-y-1 rounded-2xl border border-white/10 bg-white/5 p-2">
                      {systemSettings.items.map((item) => {
                        const Icon = item.icon
                        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => {
                              setSidebarOpen(false)
                              setProfileOpen(false)
                            }}
                            className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                              isActive
                                ? 'bg-[#1d4ed8] text-white shadow-lg shadow-blue-950/20'
                                : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </nav>

          <div className="shrink-0 border-t border-white/10 px-4 py-4 sm:py-5">
            <div className="rounded-2xl bg-white/5 p-3 sm:p-4">
              <div className="mb-3">
                <LanguageSwitcher compact />
              </div>
              <button
                type="button"
                onClick={() => setProfileOpen((current) => !current)}
                className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-1 text-left transition hover:bg-white/5"
                aria-expanded={profileOpen}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1d4ed8] text-sm font-semibold text-white">
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                  ) : (
                    user.name.charAt(0)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                  <p className="truncate text-xs text-slate-300">{user.email}</p>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.14em] text-slate-300">
                {user.role.replaceAll('_', ' ')}
              </div>
              {profileOpen && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-2">
                  <Link href="/admin/profile" onClick={() => setProfileOpen(false)} className="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10">
                    {t('common.profile', 'Profile')}
                  </Link>
                  <Link href="/admin/change-password" onClick={() => setProfileOpen(false)} className="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10">
                    {t('common.change_password', 'Change Password')}
                  </Link>
                  <SignOutButton className="min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10">
                    {t('common.sign_out', 'Sign out')}
                  </SignOutButton>
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-30 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 lg:hidden"
                  aria-label="Open navigation menu"
                  aria-controls="admin-sidebar"
                  aria-expanded={sidebarOpen}
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700 sm:text-xs">
                    {t('shell.administration_panel', 'Administration Panel')}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 sm:text-base">{branding.name}</p>
                </div>
              </div>
              <NotificationMenu accent="blue" />
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
