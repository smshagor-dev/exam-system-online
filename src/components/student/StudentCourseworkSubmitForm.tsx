'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import RichTextContent from '@/components/editor/RichTextContent'

type Props = {
  publication: {
    id: string
    title: string
    instructions: string | null
    dueAt: string | null
    maxAttempts: number | null
    allowUnlimitedAttempts: boolean
    allowTextSubmission: boolean
    allowRichTextSubmission: boolean
    allowFileUpload: boolean
    allowExternalLink: boolean
    allowGitRepository: boolean
    allowedFileTypes: string[]
    aiReviewPolicy?: {
      minWords: number | null
      maxWords: number | null
      requiredSections: string[]
      minimumReferenceCount: number | null
      citationStyle: string | null
      requiredFigures: number | null
      requiredTables: number | null
      requireRepositoryLink: boolean
      requiredAttachments: number | null
    }
    attempts: Array<{ id: string; status: string; attemptNumber: number }>
    extensionRequests: Array<{ id: string; status: string; approvedUntil: string | null }>
  }
}

export default function StudentCourseworkSubmitForm({ publication }: Props) {
  const router = useRouter()
  const [idempotencyKey] = useState(() => globalThis.crypto?.randomUUID?.() ?? `cw-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const [plainTextSubmission, setPlainTextSubmission] = useState('')
  const [richTextSubmission, setRichTextSubmission] = useState('')
  const [externalLink, setExternalLink] = useState('')
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)
  const [savingExtension, setSavingExtension] = useState(false)
  const [requestedUntil, setRequestedUntil] = useState('')
  const [extensionReason, setExtensionReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submitAttempt() {
    setSubmitting(true)
    setMessage(null)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('plainTextSubmission', plainTextSubmission)
      formData.append('richTextSubmission', richTextSubmission)
      formData.append('externalLink', externalLink)
      formData.append('repositoryUrl', repositoryUrl)
      formData.append('idempotencyKey', idempotencyKey)
      Array.from(files ?? []).forEach((file) => formData.append('files', file))

      const response = await fetch(`/api/student/coursework/publications/${publication.id}/attempts`, {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit coursework attempt')
      }
      setMessage('Coursework attempt submitted.')
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to submit coursework attempt')
    } finally {
      setSubmitting(false)
    }
  }

  async function requestExtension() {
    setSavingExtension(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch(`/api/student/coursework/publications/${publication.id}/extensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedUntil,
          reason: extensionReason,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to request extension')
      }
      setMessage('Extension request submitted.')
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to request extension')
    } finally {
      setSavingExtension(false)
    }
  }

  return (
    <div className="space-y-6">
      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{publication.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Due {publication.dueAt ? new Date(publication.dueAt).toLocaleString() : 'not set'} | {publication.allowUnlimitedAttempts ? 'Unlimited attempts' : `${publication.maxAttempts ?? 1} attempts`}
        </p>
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          Every submitted attempt is automatically analyzed before teacher review. AI provides findings and suggestions only; your teacher makes the final academic decision.
        </div>
        {publication.aiReviewPolicy ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {publication.aiReviewPolicy.minWords ? <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">Minimum words: {publication.aiReviewPolicy.minWords}</div> : null}
            {publication.aiReviewPolicy.maxWords ? <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">Maximum words: {publication.aiReviewPolicy.maxWords}</div> : null}
            {publication.aiReviewPolicy.minimumReferenceCount ? <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">Minimum references: {publication.aiReviewPolicy.minimumReferenceCount}</div> : null}
            {publication.aiReviewPolicy.citationStyle ? <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">Citation style: {publication.aiReviewPolicy.citationStyle}</div> : null}
          </div>
        ) : null}
        {publication.instructions ? (
          <RichTextContent
            html={publication.instructions}
            className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700"
          />
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Submit Attempt</h2>
        <div className="mt-6 space-y-4">
          {publication.allowTextSubmission ? (
            <label className="block text-sm font-medium text-slate-700">
              Plain text submission
              <textarea value={plainTextSubmission} onChange={(event) => setPlainTextSubmission(event.target.value)} rows={5} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            </label>
          ) : null}
          {publication.allowRichTextSubmission ? (
            <label className="block text-sm font-medium text-slate-700">
              Rich text submission
              <textarea value={richTextSubmission} onChange={(event) => setRichTextSubmission(event.target.value)} rows={8} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="Write your rich-text submission" />
            </label>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {publication.allowExternalLink ? (
              <label className="text-sm font-medium text-slate-700">
                External link
                <input value={externalLink} onChange={(event) => setExternalLink(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="https://..." />
              </label>
            ) : null}
            {publication.allowGitRepository ? (
              <label className="text-sm font-medium text-slate-700">
                Repository URL
                <input value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="https://github.com/..." />
              </label>
            ) : null}
          </div>
          {publication.allowFileUpload ? (
            <label className="block text-sm font-medium text-slate-700">
              Attachments ({publication.allowedFileTypes.join(', ')})
              <input type="file" multiple onChange={(event) => setFiles(event.target.files)} className="mt-2 block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            </label>
          ) : null}
          <div className="flex justify-end">
            <button type="button" onClick={() => void submitAttempt()} disabled={submitting} className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {submitting ? 'Submitting...' : 'Submit Attempt'}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Extension Request</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Requested deadline
            <input type="datetime-local" value={requestedUntil} onChange={(event) => setRequestedUntil(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Reason
            <textarea value={extensionReason} onChange={(event) => setExtensionReason(event.target.value)} rows={4} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => void requestExtension()} disabled={savingExtension} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {savingExtension ? 'Requesting...' : 'Request Extension'}
          </button>
        </div>
      </section>
    </div>
  )
}
