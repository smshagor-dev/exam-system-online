'use client'

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type ProfileEditorProps = {
  title: string
  description: string
  initialUser: {
    name: string
    email: string
    role: string
    avatarUrl?: string | null
  }
}

function roleLabel(role: string) {
  return role.replace(/_/g, ' ')
}

export default function ProfileEditor({ title, description, initialUser }: ProfileEditorProps) {
  const router = useRouter()
  const [name, setName] = useState(initialUser.name)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialUser.avatarUrl ?? null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const previewUrl = useMemo(() => {
    if (avatarFile) return URL.createObjectURL(avatarFile)
    if (removeAvatar) return null
    return avatarUrl
  }, [avatarFile, avatarUrl, removeAvatar])

  useEffect(() => {
    if (!avatarFile || !previewUrl || previewUrl === avatarUrl) return

    return () => {
      URL.revokeObjectURL(previewUrl)
    }
  }, [avatarFile, avatarUrl, previewUrl])

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setAvatarFile(file)
    setRemoveAvatar(false)
    setError(null)
    setSuccess(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const formData = new FormData()
      formData.append('name', name)
      formData.append('removeAvatar', removeAvatar ? 'true' : 'false')
      if (avatarFile) {
        formData.append('avatar', avatarFile)
      }

      const response = await fetch('/api/account/profile', {
        method: 'PATCH',
        body: formData,
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile')
      }

      setAvatarFile(null)
      setAvatarUrl(data.avatarUrl ?? null)
      setName(data.name)
      setRemoveAvatar(false)
      setSuccess('Profile updated successfully')
      router.refresh()
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Failed to update profile')
    } finally {
      setSubmitting(false)
    }
  }

  const avatarInitial = name.trim().charAt(0).toUpperCase() || initialUser.email.charAt(0).toUpperCase()

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">{title}</p>
        <h1 className="text-2xl font-semibold text-slate-900">{description}</h1>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 grid gap-8 lg:grid-cols-[280px,minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-col items-center text-center">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={name}
                className="h-28 w-28 rounded-full border border-slate-200 object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-sky-600 text-3xl font-semibold text-white shadow-sm">
                {avatarInitial}
              </div>
            )}

            <p className="mt-4 text-lg font-semibold text-slate-900">{name}</p>
            <p className="text-sm text-slate-500">{initialUser.email}</p>
            <div className="mt-3 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-sm">
              {roleLabel(initialUser.role)}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Profile image
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="mt-2 block w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-sky-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-sky-700"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setAvatarFile(null)
                setRemoveAvatar(true)
                setSuccess(null)
                setError(null)
              }}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Remove image
            </button>
            <p className="text-xs text-slate-500">Use JPG, PNG, WEBP, or GIF up to 2MB.</p>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Full name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                placeholder="Enter your name"
                required
              />
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Email address
              <input
                type="email"
                value={initialUser.email}
                disabled
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
              />
            </label>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </div>
      </form>
    </section>
  )
}
