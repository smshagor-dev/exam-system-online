'use client'

import { useI18n } from '@/components/i18n/LanguageProvider'
import {
  Bell,
  BookOpen,
  CalendarDays,
  GraduationCap,
  LayoutGrid,
  Menu,
  ScrollText,
  School2,
  TrendingUp,
  Users,
} from 'lucide-react'

type AdminDashboardViewProps = {
  adminName: string
  kpis: {
    students: string
    teachers: string
    subjects: string
    exams: string
    results: string
  }
  overviewData: OverviewPoint[]
  recentExams: RecentExam[]
  systemStats: {
    departments: string
    subjects: string
    groups: string
    academicYears: string
  }
}

type OverviewPoint = {
  month: string
  value: number
}

type RecentExam = {
  name: string
  subject: string
  date: string
  status: 'Upcoming' | 'Scheduled'
}

export default function AdminDashboardView({
  adminName,
  kpis,
  overviewData,
  recentExams,
  systemStats,
}: AdminDashboardViewProps) {
  const { t } = useI18n()
  const maxValue = Math.max(...overviewData.map((item) => item.value), 1)
  const openSidebar = () => window.dispatchEvent(new Event('admin-sidebar-open'))
  const kpiCards = [
    { label: t('shell.students', 'Students'), value: kpis.students, icon: GraduationCap, iconBg: 'bg-blue-100', iconText: 'text-blue-700' },
    { label: t('shell.teachers', 'Teachers'), value: kpis.teachers, icon: Users, iconBg: 'bg-sky-100', iconText: 'text-sky-700' },
    { label: t('shell.subjects', 'Subjects'), value: kpis.subjects, icon: BookOpen, iconBg: 'bg-indigo-100', iconText: 'text-indigo-700' },
    { label: t('shell.exams', 'Exams'), value: kpis.exams, icon: ScrollText, iconBg: 'bg-cyan-100', iconText: 'text-cyan-700' },
    { label: t('shell.results', 'Results'), value: kpis.results, icon: TrendingUp, iconBg: 'bg-blue-100', iconText: 'text-blue-700' },
  ]
  const systemStatCards = [
    { label: t('shell.departments', 'Departments'), value: systemStats.departments, icon: School2 },
    { label: t('shell.subjects', 'Subjects'), value: systemStats.subjects, icon: BookOpen },
    { label: t('shell.groups', 'Groups'), value: systemStats.groups, icon: LayoutGrid },
    { label: t('shell.academic_years', 'Academic Years'), value: systemStats.academicYears, icon: CalendarDays },
  ]

  return (
    <div className="space-y-6 lg:space-y-8">
      <header className="rounded-[28px] border border-slate-200/80 bg-white px-5 py-4 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.20)] sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openSidebar}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-slate-950 sm:text-2xl">{t('admin.dashboard.welcome', 'Welcome back, Admin!')}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {t('admin.dashboard.subtitle', "Here's what's happening with your exam management system today.")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-blue-600" />
            </button>
            <div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 sm:flex">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1d4ed8] text-sm font-semibold text-white">
                {adminName.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{adminName}</p>
                <p className="text-xs text-slate-500">{t('admin.dashboard.system_administrator', 'System Administrator')}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpiCards.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.label}
              className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_45px_-28px_rgba(29,78,216,0.22)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">{item.label}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{item.value}</p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.iconBg}`}>
                  <Icon className={`h-6 w-6 ${item.iconText}`} />
                </div>
              </div>
            </div>
          )
        })}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_0.9fr]">
        <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.22)] sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">{t('admin.dashboard.exams_overview', 'Exams Overview')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('admin.dashboard.monthly_activity', 'Monthly exam activity throughout the year')}</p>
            </div>
            <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              Jan - Dec
            </div>
          </div>

          <div className="mt-8">
            <div className="flex h-[260px] items-end justify-between gap-2 sm:gap-3">
              {overviewData.map((item) => (
                <div key={item.month} className="flex flex-1 flex-col items-center justify-end gap-3">
                  <div className="flex h-[220px] w-full items-end">
                    <div
                      className="w-full rounded-t-[18px] bg-gradient-to-t from-[#1d4ed8] to-[#60a5fa] shadow-[0_10px_20px_-12px_rgba(29,78,216,0.55)] transition duration-300 hover:from-[#1e40af] hover:to-[#3b82f6]"
                      style={{ height: `${(item.value / maxValue) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-500">{item.month}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.22)] sm:p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{t('admin.dashboard.system_statistics', 'System Statistics')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('admin.dashboard.core_metrics', 'Core academic structure metrics')}</p>
          </div>

          <div className="mt-6 space-y-4">
            {systemStatCards.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-blue-200 hover:bg-blue-50/60"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-medium text-slate-700">{item.label}</span>
                  </div>
                  <span className="text-2xl font-semibold text-slate-950">{item.value}</span>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.22)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{t('admin.dashboard.recent_exams', 'Recent Exams')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('admin.dashboard.latest_assessments', 'Latest assessments scheduled inside the system')}</p>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {recentExams.length} {t('common.records', 'records')}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {[
                  t('admin.dashboard.exam_name', 'Exam Name'),
                  t('admin.dashboard.subject', 'Subject'),
                  t('admin.dashboard.date', 'Date'),
                  t('admin.dashboard.status', 'Status'),
                ].map((heading) => (
                  <th
                    key={heading}
                    className="border-b border-slate-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentExams.length > 0 ? (
                recentExams.map((exam) => (
                  <tr key={`${exam.name}-${exam.date}`} className="transition hover:bg-slate-50/80">
                    <td className="border-b border-slate-100 px-4 py-4 text-sm font-medium text-slate-900">
                      {exam.name}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-4 text-sm text-slate-600">
                      {exam.subject}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-4 text-sm text-slate-600">
                      {exam.date}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-4">
                      <StatusBadge status={exam.status} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="border-b border-slate-100 px-4 py-10 text-center text-sm text-slate-400">
                    {t('admin.dashboard.no_exams', 'No exams available yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="flex flex-col gap-2 border-t border-slate-200 px-1 pt-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>{t('admin.dashboard.all_rights', '© 2024 Exam Management System. All rights reserved.')}</p>
        <p>{t('common.version', 'Version 1.0.0')}</p>
      </footer>
    </div>
  )
}

function StatusBadge({ status }: { status: RecentExam['status'] }) {
  const styles =
    status === 'Upcoming'
      ? 'bg-blue-50 text-blue-700 ring-blue-100'
      : 'bg-emerald-50 text-emerald-700 ring-emerald-100'

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${styles}`}>
      {status}
    </span>
  )
}
