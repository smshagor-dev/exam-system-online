'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ComponentType, ReactNode } from 'react'
import { useState } from 'react'
import SignOutButton from '@/components/auth/SignOutButton'
import BrandBadge from '@/components/branding/BrandBadge'
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher'
import { useI18n } from '@/components/i18n/LanguageProvider'
import {
  BarChart3,
  BookOpen,
  BookText,
  ChevronDown,
  ChevronsUpDown,
  CalendarRange,
  CalendarDays,
  GraduationCap,
  Languages,
  Layers3,
  Menu,
  School2,
  Settings2,
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
  const pathname = usePathname()
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
    systemSettings.items.some((item) => pathname === item.href)
  )

  const isSystemSettingsRoute = systemSettings.items.some((item) => pathname === item.href)

  return (
    <div className="h-screen overflow-hidden bg-[#f4f7fb]">
      <div className="flex h-full overflow-hidden">
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
            <BrandBadge
              name={branding.name}
              shortName={branding.shortName}
              logoUrl={branding.logoUrl}
              subtitle={t('shell.administration_panel', 'Administration Panel')}
              accentClassName="bg-[#1d4ed8] text-white shadow-blue-950/30"
            />
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
              {t('common.menu', 'Menu')}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 pb-6">
            <div className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              {t('shell.main_menu', 'Main Menu')}
            </div>
            <div className="space-y-1.5">
              {items.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      setSidebarOpen(false)
                      setProfileOpen(false)
                    }}
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

              {systemSettings.items.length > 0 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setSettingsOpen((current) => !current)}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                      isSystemSettingsRoute
                        ? 'bg-white/10 text-white'
                        : 'text-slate-300 hover:bg-white/8 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <systemSettings.icon className="h-5 w-5 shrink-0" />
                      <span>{systemSettings.label}</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {(settingsOpen || isSystemSettingsRoute) && (
                    <div className="mt-2 space-y-1 rounded-2xl border border-white/10 bg-white/5 p-2">
                      {systemSettings.items.map((item) => {
                        const Icon = item.icon
                        const isActive = pathname === item.href

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => {
                              setSidebarOpen(false)
                              setProfileOpen(false)
                            }}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                              isActive
                                ? 'bg-[#1d4ed8] text-white shadow-lg shadow-blue-950/20'
                                : 'text-slate-300 hover:bg-white/8 hover:text-white'
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </nav>

          <div className="border-t border-white/10 px-4 py-5">
            <div className="rounded-2xl bg-white/5 p-4">
              <div className="mb-3">
                <LanguageSwitcher compact />
              </div>
              <button
                type="button"
                onClick={() => setProfileOpen((current) => !current)}
                className="flex w-full items-center gap-3 rounded-2xl text-left transition hover:bg-white/5"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1d4ed8] text-sm font-semibold text-white">
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt={user.name} className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    user.name.charAt(0)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                  <p className="truncate text-xs text-slate-300">{user.email}</p>
                </div>
                <ChevronsUpDown className="h-4 w-4 text-slate-400" />
              </button>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-300">
                {user.role.replace('_', ' ')}
              </div>
              {profileOpen && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-2">
                  <Link
                    href="/admin/profile"
                    onClick={() => setProfileOpen(false)}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10"
                  >
                    {t('common.profile', 'Profile')}
                  </Link>
                  <Link
                    href="/admin/change-password"
                    onClick={() => setProfileOpen(false)}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10"
                  >
                    {t('common.change_password', 'Change Password')}
                  </Link>
                  <SignOutButton
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10"
                  >
                    {t('common.sign_out', 'Sign out')}
                  </SignOutButton>
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="min-h-full px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto max-w-[1400px]">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
