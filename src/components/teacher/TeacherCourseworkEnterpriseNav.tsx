'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  { href: '/teacher/coursework', label: 'Overview' },
  { href: '/teacher/coursework/templates', label: 'Templates' },
  { href: '/teacher/coursework/assignments', label: 'Assignments' },
  { href: '/teacher/coursework/submissions', label: 'Submissions' },
  { href: '/teacher/coursework/grading', label: 'Grading' },
  { href: '/teacher/coursework/extensions', label: 'Extensions' },
  { href: '/teacher/coursework/reports', label: 'Reports' },
]

export default function TeacherCourseworkEnterpriseNav() {
  const pathname = usePathname() ?? ''

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
