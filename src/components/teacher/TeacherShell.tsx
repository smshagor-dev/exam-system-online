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
  BookCheck,
  BookOpenCheck,
  BookText,
  Bot,
  ChevronsUpDown,
  ClipboardList,
  FileBadge2,
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

  useEffect(() => {
    setSidebarOpen(false)
    setProfileOpen(false)
  }, [pathname])

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
          id="teacher-sidebar"
          aria-label="Teacher navigation"
          className={`fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[272px] flex-col bg-[#102347] text-white shadow-2xl transition-transform duration-300 sm:w-[272px] lg:static lg:translate-x-0 lg:shadow-none ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-5 sm:px-6 sm:py-6">
            <BrandBadge
              name={branding.name}
              shortName={branding.shortName}
              logoUrl={branding.logoUrl}
              subtitle={t('shell.teacher_workspace', 'Teacher Workspace')}
              accentClassName="bg-[#0ea5e9] text-slate-950 shadow-sky-950/25"
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
            <div className="space-y-6">
              {navSections.map((section) => (
                <div key={section.title}>
                  <div className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    {section.title}
                  </div>
                  <div className="space-y-1.5">
                    {section.items.map((item) => {
                      const Icon = item.icon
                      const isCourseworkOverview = item.href === '/teacher/coursework'
                      const isActive = pathname === item.href || (!isCourseworkOverview && pathname.startsWith(`${item.href}/`))

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
                              ? 'bg-[#0ea5e9] text-slate-950 shadow-lg shadow-sky-950/20'
                              : 'text-slate-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          <span className="min-w-0 truncate">{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
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
                className="flex min-h-11 w-full items-center gap-3 rounded-2xl bg-white/8 px-3 py-3 text-left text-white transition hover:bg-white/12"
                aria-expanded={profileOpen}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0ea5e9] text-sm font-semibold text-slate-950">
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                  ) : (
                    user.name.charAt(0)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                  <p className="truncate text-xs text-slate-200">{user.email}</p>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-200" />
              </button>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.14em] text-slate-300">
                {user.role.replaceAll('_', ' ')}
              </div>
              {profileOpen && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-2">
                  <Link href="/teacher/profile" onClick={() => setProfileOpen(false)} className="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10">
                    {t('common.profile', 'Profile')}
                  </Link>
                  <Link href="/teacher/change-password" onClick={() => setProfileOpen(false)} className="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10">
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
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 lg:hidden"
                  aria-label="Open navigation menu"
                  aria-controls="teacher-sidebar"
                  aria-expanded={sidebarOpen}
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700 sm:text-xs">
                    {t('shell.teacher_panel', 'Teacher Panel')}
                  </p>
                  <h1 className="mt-0.5 truncate text-sm font-semibold text-slate-900 sm:text-base">
                    {t('shell.teaching_workspace', 'Teaching Workspace')}
                  </h1>
                </div>
              </div>
              <NotificationMenu accent="sky" />
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
