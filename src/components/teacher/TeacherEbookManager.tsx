'use client'

import { formatBytes } from '@/lib/ebooks'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

type AssignmentOption = {
  id: string
  subjectName: string
  languageName: string
  groupName: string
  academicYearName: string
  semesterName: string
}

type EbookItem = {
  id: string
  title: string
  description: string | null
  author: string | null
  category: string | null
  fileUrl: string
  fileSizeBytes: number
  createdAt: string
  subjectName: string
  languageName: string
  groupName: string
  academicYearName: string
  semesterName: string
}

type Props = {
  assignments: AssignmentOption[]
  initialUploads: EbookItem[]
}

export default function TeacherEbookManager({ assignments, initialUploads }: Props) {
  const router = useRouter()
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [author, setAuthor] = useState('')
  const [category, setCategory] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const formData = new FormData()
      formData.append('assignmentId', assignmentId)
      formData.append('title', title)
      formData.append('description', description)
      formData.append('author', author)
      formData.append('category', category)
      if (file) {
        formData.append('file', file)
      }

      const response = await fetch('/api/ebooks', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload ebook')
      }

      setTitle('')
      setDescription('')
      setAuthor('')
      setCategory('')
      setFile(null)
      setSuccess('Ebook uploaded successfully')
      router.refresh()
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Failed to upload ebook')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(`/api/ebooks/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete ebook')
      }

      setSuccess('Ebook deleted successfully')
      router.refresh()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete ebook')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-slate-900">Teacher Ebooks</h1>
          <p className="mt-1 text-sm text-slate-500">
            Upload PDF ebooks by your assigned subject, department language, year, semester, and group.
          </p>
        </div>

        {assignments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
            No active assignments found. Ask your department admin to assign your classes first.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-5">
            <label className="block text-sm font-medium text-slate-700">
              Assignment
              <select
                value={assignmentId}
                onChange={(event) => setAssignmentId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                required
              >
                {assignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.subjectName} · {assignment.languageName} · {assignment.academicYearName} · {assignment.semesterName} · {assignment.groupName}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Ebook Title
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  placeholder="Example: DBMS Semester Notes"
                  required
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                PDF File
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="mt-2 block w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-sky-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-sky-700"
                  required
                />
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Author
                <input
                  type="text"
                  value={author}
                  onChange={(event) => setAuthor(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  placeholder="Optional author metadata"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Category
                <input
                  type="text"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  placeholder="Optional category metadata"
                />
              </label>
            </div>

            <label className="block text-sm font-medium text-slate-700">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                placeholder="Optional short note about this ebook"
              />
            </label>

            {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Uploading...' : 'Upload Ebook'}
              </button>
            </div>
          </form>
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-xl font-semibold text-slate-900">My Uploaded Ebooks</h2>
          <p className="mt-1 text-sm text-slate-500">
            {initialUploads.length} upload{initialUploads.length !== 1 ? 's' : ''} found
          </p>
        </div>

        {initialUploads.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No ebooks uploaded yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {initialUploads.map((ebook) => (
              <div key={ebook.id} className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-slate-900">{ebook.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {ebook.subjectName} · {ebook.languageName} · {ebook.academicYearName} · {ebook.semesterName} · {ebook.groupName}
                  </p>
                  {ebook.description ? <p className="mt-2 text-sm text-slate-600">{ebook.description}</p> : null}
                  {(ebook.author || ebook.category) ? (
                    <p className="mt-2 text-xs text-slate-500">
                      {[ebook.author, ebook.category].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-slate-400">
                    Uploaded on {new Date(ebook.createdAt).toLocaleDateString()} · {formatBytes(ebook.fileSizeBytes)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <a
                    href={ebook.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Open PDF
                  </a>
                  <a
                    href={ebook.fileUrl}
                    download={ebook.title}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleDelete(ebook.id)}
                    disabled={deletingId === ebook.id}
                    className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingId === ebook.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
