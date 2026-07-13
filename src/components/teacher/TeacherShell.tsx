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
  Bot,
  BarChart3,
  BookText,
  BookCheck,
  BookOpenCheck,
  FileBadge2,
  ChevronsUpDown,
  ClipboardList,
  Languages,
  Menu,
  ScrollText,
  SquarePen,
  Users,
  X,
} from 'lucide-react'

type TeacherShellProps = {
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

type NavSection = {
  title: string
  items: NavItem[]
}

export default function TeacherShell({ children, user, branding }: TeacherShellProps) {
  const { t } = useI18n()
  const pathname = usePathname() ?? ''
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const navSections: NavSection[] = [
    {
      title: t('shell.teaching_panel', 'Teaching Panel'),
      items: [
        { href: '/teacher/dashboard', label: t('shell.dashboard', 'Dashboard'), icon: BarChart3 },
        { href: '/teacher/assignments', label: t('shell.assignments', 'Assignments'), icon: ClipboardList },
        { href: '/teacher/questions', label: t('shell.question_bank', 'Question Bank'), icon: BookOpenCheck },
        { href: '/teacher/translations', label: 'Translations', icon: Languages },
        { href: '/teacher/ebooks', label: 'Ebooks', icon: BookText },
        { href: '/teacher/exams', label: t('shell.exams', 'Exams'), icon: ScrollText },
        { href: '/teacher/invigilation', label: 'Invigilation', icon: ClipboardList },
        { href: '/teacher/exams/create', label: t('shell.create_exam', 'Create Exam'), icon: SquarePen },
        { href: '/teacher/students', label: t('shell.students', 'Students'), icon: Users },
        { href: '/teacher/reviews', label: t('shell.reviews', 'Reviews'), icon: BookCheck },
        { href: '/teacher/ai-settings', label: t('common.ai_settings', 'AI Settings'), icon: Bot },
      ],
    },
    {
      title: 'Course Work & Report',
      items: [
        { href: '/teacher/coursework', label: 'Overview', icon: FileBadge2 },
        { href: '/teacher/coursework/templates', label: 'Templates', icon: SquarePen },
        { href: '/teacher/coursework/assignments', label: 'Assignments', icon: ClipboardList },
        { href: '/teacher/coursework/submissions', label: 'Submissions', icon: ScrollText },
        { href: '/teacher/coursework/grading', label: 'Grading', icon: BookCheck },
        { href: '/teacher/coursework/extensions', label: 'Extensions', icon: FileBadge2 },
        { href: '/teacher/coursework/reports', label: 'Reports', icon: BarChart3 },
        { href: '/teacher/coursework/create', label: 'Legacy Create', icon: SquarePen },
        { href: '/teacher/coursework/submitted', label: 'Legacy Submitted', icon: ScrollText },
      ],
    },
  ]

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
          className={`fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col bg-[#102347] text-white transition-transform duration-300 lg:static lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-6">
            <BrandBadge
              name={branding.name}
              shortName={branding.shortName}
              logoUrl={branding.logoUrl}
              subtitle={t('shell.teacher_workspace', 'Teacher Workspace')}
              accentClassName="bg-[#0ea5e9] text-slate-950 shadow-sky-950/25"
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
              onClick={() => setSidebarOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/12 px-4 py-3 text-sm font-semibold text-white shadow-sm"
            >
              <Menu className="h-4 w-4" />
              {t('common.menu', 'Menu')}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 pb-6">
            <div className="space-y-6">
              {navSections.map((section) => (
                <div key={section.title}>
                  <div className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    {section.title}
                  </div>
                  <div className="space-y-1.5">
                    {section.items.map((item) => {
                      const Icon = item.icon
                      const isActive = pathname === item.href || (item.href !== '/teacher/coursework' && pathname.startsWith(`${item.href}/`))

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
                              ? 'bg-[#0ea5e9] text-slate-950 shadow-lg shadow-sky-950/20'
                              : 'text-slate-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
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
                className="flex w-full items-center gap-3 rounded-2xl bg-white/8 px-3 py-3 text-left text-white transition hover:bg-white/12"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0ea5e9] text-sm font-semibold text-slate-950">
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt={user.name} className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    user.name.charAt(0)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                  <p className="truncate text-xs text-slate-200">{user.email}</p>
                </div>
                <ChevronsUpDown className="h-4 w-4 text-slate-200" />
              </button>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-300">
                {user.role.replace('_', ' ')}
              </div>
              {profileOpen && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-2">
                  <Link
                    href="/teacher/profile"
                    onClick={() => setProfileOpen(false)}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10"
                  >
                    {t('common.profile', 'Profile')}
                  </Link>
                  <Link
                    href="/teacher/change-password"
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

        <main className="min-w-0 flex-1 overflow-hidden">
          <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/75 backdrop-blur">
            <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">{t('shell.teacher_panel', 'Teacher Panel')}</p>
                <h1 className="mt-1 text-lg font-semibold text-slate-900">{t('shell.teaching_workspace', 'Teaching Workspace')}</h1>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm lg:hidden"
              >
                <Menu className="h-4 w-4" />
                {t('common.menu', 'Menu')}
              </button>
            </div>
          </div>

          <div className="h-[calc(100vh-81px)] overflow-y-auto px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto max-w-[1400px]">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
