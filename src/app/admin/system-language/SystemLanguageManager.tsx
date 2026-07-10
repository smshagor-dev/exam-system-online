'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher'
import { useI18n } from '@/components/i18n/LanguageProvider'

type TranslationEntry = {
  id: string
  locale: string
  key: string
  value: string
  createdAt: string | Date
  updatedAt: string | Date
}

type LocaleOption = {
  code: string
  label: string
}

type SourceEntry = {
  internalKey: string
  key: string
}

type TranslationRow = {
  id: string
  locale: string
  key: string
  value: string
  internalKey?: string
  persisted: boolean
}

type SystemLanguageItem = {
  id: string
  name: string
  code: string
  isActive: boolean
  isDefault: boolean
}

type Props = {
  entries: TranslationEntry[]
  locales: LocaleOption[]
  sourceEntries: SourceEntry[]
  systemLanguages: SystemLanguageItem[]
}

export default function SystemLanguageManager({ entries, locales, sourceEntries, systemLanguages }: Props) {
  const router = useRouter()
  const { t } = useI18n()
  const defaultLocale = locales[0]?.code ?? 'en'
  const [selectedLocale, setSelectedLocale] = useState(defaultLocale)
  const [search, setSearch] = useState('')
  const [showTranslationModal, setShowTranslationModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSystemLanguageModal, setShowSystemLanguageModal] = useState(false)
  const [systemLanguageEditingId, setSystemLanguageEditingId] = useState<string | null>(null)
  const [systemLanguageLoading, setSystemLanguageLoading] = useState(false)
  const [systemLanguageError, setSystemLanguageError] = useState<string | null>(null)
  const [form, setForm] = useState({
    locale: defaultLocale,
    key: '',
    value: '',
  })
  const [systemLanguageForm, setSystemLanguageForm] = useState({
    name: '',
    code: '',
    isDefault: false,
  })

  const filteredEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const localeEntries = entries.filter((entry) => entry.locale === selectedLocale)
    const entryByKey = new Map(localeEntries.map((entry) => [entry.key, entry]))
    const sourceInternalKeys = new Set(sourceEntries.map((entry) => entry.internalKey))
    const sourceEnglishKeys = new Set(sourceEntries.map((entry) => entry.key))

    const rows: TranslationRow[] = sourceEntries.map((sourceEntry) => {
      const persistedEntry = entryByKey.get(sourceEntry.key) ?? entryByKey.get(sourceEntry.internalKey)

      return {
        id: persistedEntry?.id ?? `source:${selectedLocale}:${sourceEntry.internalKey}`,
        locale: selectedLocale,
        key: sourceEntry.key,
        value: persistedEntry?.value ?? (selectedLocale === 'en' ? sourceEntry.key : ''),
        internalKey: sourceEntry.internalKey,
        persisted: Boolean(persistedEntry),
      }
    })

    const extraRows = localeEntries
      .filter((entry) => !sourceEnglishKeys.has(entry.key) && !sourceInternalKeys.has(entry.key))
      .map<TranslationRow>((entry) => ({
        id: entry.id,
        locale: entry.locale,
        key: entry.key,
        value: entry.value,
        internalKey: undefined,
        persisted: true,
      }))

    return [...rows, ...extraRows].filter((entry) => {
      if (!normalizedSearch) return true

      return [entry.key, entry.internalKey ?? '', entry.value]
        .some((value) => value.toLowerCase().includes(normalizedSearch))
    })
  }, [entries, search, selectedLocale, sourceEntries])

  const resetForm = () => {
    setEditingId(null)
    setError(null)
    setForm({
      locale: selectedLocale,
      key: '',
      value: '',
    })
  }

  const openCreateTranslationModal = () => {
    resetForm()
    setForm({
      locale: selectedLocale,
      key: '',
      value: '',
    })
    setShowTranslationModal(true)
  }

  const startEdit = (entry: TranslationEntry) => {
    setEditingId(entry.id)
    setError(null)
    setForm({
      locale: entry.locale,
      key: entry.key,
      value: entry.value,
    })
    setShowTranslationModal(true)
  }

  const startEditRow = (entry: TranslationRow) => {
    if (!entry.persisted) {
      setEditingId(null)
      setError(null)
      setForm({
        locale: entry.locale,
        key: entry.key,
        value: entry.value,
      })
      setShowTranslationModal(true)
      return
    }

    const persistedEntry = entries.find((item) => item.id === entry.id)
    if (persistedEntry) {
      startEdit(persistedEntry)
    }
  }

  const closeTranslationModal = () => {
    setShowTranslationModal(false)
    resetForm()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (!form.key.trim()) {
        throw new Error(t('admin.system_language.translation_key_required', 'English key cannot be empty.'))
      }

      if (!form.value.trim()) {
        throw new Error(t('admin.system_language.empty_value', 'Value cannot be empty.'))
      }

      const url = editingId ? `/api/admin/translations/${editingId}` : '/api/admin/translations'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || t('admin.simple.save_failed', 'Save failed'))
      }

      setShowTranslationModal(false)
      resetForm()
      router.refresh()
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : t('admin.simple.save_failed', 'Save failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('admin.system_language.delete_confirm', 'Delete this translation entry?'))) return

    const res = await fetch(`/api/admin/translations/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      alert(data.error || t('admin.simple.delete_failed', 'Delete failed'))
      return
    }

    if (editingId === id) resetForm()
    router.refresh()
  }

  const resetSystemLanguageForm = () => {
    setSystemLanguageEditingId(null)
    setSystemLanguageError(null)
    setSystemLanguageForm({
      name: '',
      code: '',
      isDefault: false,
    })
  }

  const openCreateSystemLanguageModal = () => {
    resetSystemLanguageForm()
    setShowSystemLanguageModal(true)
  }

  const openEditSystemLanguageModal = (item: SystemLanguageItem) => {
    setSystemLanguageEditingId(item.id)
    setSystemLanguageError(null)
    setSystemLanguageForm({
      name: item.name,
      code: item.code,
      isDefault: item.isDefault,
    })
    setShowSystemLanguageModal(true)
  }

  const closeSystemLanguageModal = () => {
    setShowSystemLanguageModal(false)
    resetSystemLanguageForm()
  }

  const handleSystemLanguageSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSystemLanguageLoading(true)
    setSystemLanguageError(null)

    try {
      const payload = {
        name: systemLanguageForm.name.trim(),
        code: systemLanguageForm.code.trim().toUpperCase(),
        isDefault: systemLanguageForm.isDefault,
      }

      const url = systemLanguageEditingId
        ? `/api/admin/system-languages/${systemLanguageEditingId}`
        : '/api/admin/system-languages'
      const method = systemLanguageEditingId ? 'PATCH' : 'POST'
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || t('admin.simple.save_failed', 'Save failed'))
      }

      closeSystemLanguageModal()
      router.refresh()
    } catch (submissionError) {
      setSystemLanguageError(
        submissionError instanceof Error ? submissionError.message : t('admin.simple.save_failed', 'Save failed')
      )
    } finally {
      setSystemLanguageLoading(false)
    }
  }

  const handleSystemLanguageDelete = async (item: SystemLanguageItem) => {
    if (!confirm(`${t('admin.simple.delete_confirm', 'Delete')} "${item.name}"?`)) return

    const response = await fetch(`/api/admin/system-languages/${item.id}`, { method: 'DELETE' })
    if (!response.ok) {
      const data = await response.json()
      alert(data.error || t('admin.simple.delete_failed', 'Delete failed'))
      return
    }

    router.refresh()
  }

  const handleSetDefaultSystemLanguage = async (item: SystemLanguageItem) => {
    const response = await fetch(`/api/admin/system-languages/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: item.name,
        code: item.code,
        isDefault: true,
      }),
    })

    if (!response.ok) {
      const data = await response.json()
      alert(data.error || t('admin.simple.save_failed', 'Save failed'))
      return
    }

    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('admin.system_language.title', 'System Language')}</h1>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">{t('common.system_languages', 'System Languages')}</h2>
              <p className="mt-1 text-sm text-slate-500">{systemLanguages.length} {t('admin.simple.items', 'items')}</p>
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <button
                type="button"
                onClick={openCreateSystemLanguageModal}
                className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                + {t('admin.simple.add', 'Add')} {t('common.system_language_name', 'System Language')}
              </button>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {t('admin.system_language.current_language', 'Current Language')}
                </p>
                <LanguageSwitcher />
              </div>
            </div>
          </div>
        </div>
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t('common.name', 'Name')}
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t('common.code', 'Code')}
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t('common.active', 'Active')}
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Default
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t('common.actions', 'Actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {systemLanguages.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-5 py-4 text-sm font-medium text-slate-900">{item.name}</td>
                <td className="px-5 py-4 font-mono text-sm text-slate-600">{item.code}</td>
                <td className="px-5 py-4 text-sm text-slate-600">{item.isActive ? t('common.yes', 'Yes') : t('common.no', 'No')}</td>
                <td className="px-5 py-4 text-sm text-slate-600">
                  {item.isDefault ? (
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">Default</span>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => openEditSystemLanguageModal(item)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      {t('common.edit', 'Edit')}
                    </button>
                    {!item.isDefault && (
                      <button
                        type="button"
                        onClick={() => handleSetDefaultSystemLanguage(item)}
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                      >
                        Make Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSystemLanguageDelete(item)}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                      disabled={item.code.toUpperCase() === 'EN' || item.isDefault}
                    >
                      {t('common.delete', 'Delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {systemLanguages.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">
                  {t('common.no_items_yet', 'No items yet')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {t('admin.system_language.available_entries', 'Available Translation Entries')}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredEntries.length} {t('common.records', 'records')}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                value={selectedLocale}
                onChange={(event) => {
                  const nextLocale = event.target.value
                  setSelectedLocale(nextLocale)
                  if (!editingId) {
                    setForm((current) => ({ ...current, locale: nextLocale }))
                  }
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                {locales.map((locale) => (
                  <option key={locale.code} value={locale.code}>
                    {locale.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('admin.system_language.search_placeholder', 'Search by translation key...')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={openCreateTranslationModal}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                + {t('admin.system_language.create_entry', 'Create Entry')}
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t('admin.system_language.locale', 'Locale')}
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t('admin.system_language.translation_key', 'English Key')}
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t('admin.system_language.translation_value', 'Translation Value')}
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t('admin.system_language.reference_key', 'System Key')}
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t('common.actions', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 align-top">
                    <td className="px-3 py-4 text-sm text-slate-600">{entry.locale.toUpperCase()}</td>
                    <td className="px-3 py-4 text-sm text-slate-700">{entry.key}</td>
                    <td className="px-3 py-4 text-sm text-slate-700">{entry.value}</td>
                    <td className="px-3 py-4 font-mono text-xs text-slate-500">{entry.internalKey ?? '-'}</td>
                    <td className="px-3 py-4">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => startEditRow(entry)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          {entry.persisted ? t('common.edit', 'Edit') : t('common.create', 'Create')}
                        </button>
                        {entry.persisted && (
                          <button
                            type="button"
                            onClick={() => handleDelete(entry.id)}
                            className="text-xs font-medium text-red-600 hover:text-red-700"
                          >
                            {t('common.delete', 'Delete')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-sm text-slate-400">
                      {t('admin.system_language.no_entries', 'No translation entries created yet.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </div>

      {showSystemLanguageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {systemLanguageEditingId
                    ? `${t('admin.simple.edit', 'Edit')} ${t('common.system_language_name', 'System Language')}`
                    : `${t('admin.simple.new', 'New')} ${t('common.system_language_name', 'System Language')}`}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add a system language for the site interface and translation locale list.
                </p>
              </div>
              <button
                type="button"
                onClick={closeSystemLanguageModal}
                className="rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              >
                {t('common.cancel', 'Close')}
              </button>
            </div>

            {systemLanguageError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {systemLanguageError}
              </div>
            )}

            <form onSubmit={handleSystemLanguageSubmit} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t('common.system_language_name', 'System Language')} *
                </label>
                <input
                  type="text"
                  value={systemLanguageForm.name}
                  onChange={(event) => setSystemLanguageForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="Example: Bangla"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t('common.code', 'Code')} *
                </label>
                <input
                  type="text"
                  value={systemLanguageForm.code}
                  onChange={(event) =>
                    setSystemLanguageForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase outline-none focus:border-blue-500"
                  placeholder="Example: BN"
                  required
                />
              </div>

              <label className="inline-flex items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={systemLanguageForm.isDefault}
                  onChange={(event) =>
                    setSystemLanguageForm((current) => ({ ...current, isDefault: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Use as default site language</span>
              </label>
              <p className="text-xs text-slate-500">English is always kept as an available system language. You can choose any system language as the site default.</p>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={systemLanguageLoading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {systemLanguageLoading
                    ? t('common.saving', 'Saving...')
                    : systemLanguageEditingId
                    ? t('common.update', 'Update')
                    : t('common.create', 'Create')}
                </button>
                <button
                  type="button"
                  onClick={closeSystemLanguageModal}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTranslationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {editingId
                    ? t('admin.system_language.edit_entry', 'Edit Translation Entry')
                    : t('admin.system_language.new_entry', 'New Translation Entry')}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add or update localized values using English source text as the key.
                </p>
              </div>
              <button
                type="button"
                onClick={closeTranslationModal}
                className="rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              >
                {t('common.cancel', 'Close')}
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t('admin.system_language.locale', 'Locale')}
                </label>
                <select
                  value={form.locale}
                  onChange={(event) => setForm((current) => ({ ...current, locale: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  {locales.map((locale) => (
                    <option key={locale.code} value={locale.code}>
                      {locale.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">{t('admin.system_language.locale_help', 'Pick the language to manage.')}</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t('admin.system_language.translation_key', 'English Key')}
                </label>
                <input
                  type="text"
                  value={form.key}
                  onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
                  placeholder={t('admin.system_language.key_hint', 'Example: Dashboard')}
                  list="translation-source-keys"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  required
                />
                <datalist id="translation-source-keys">
                  {sourceEntries.map((entry) => (
                    <option key={entry.internalKey} value={entry.key} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t('admin.system_language.translation_value', 'Translation Value')}
                </label>
                <textarea
                  rows={6}
                  value={form.value}
                  onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
                  placeholder={t('admin.system_language.value_hint', 'Localized text shown to users')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {loading
                    ? t('common.saving', 'Saving...')
                    : editingId
                    ? t('admin.system_language.update_entry', 'Update Entry')
                    : t('admin.system_language.create_entry', 'Create Entry')}
                </button>
                <button
                  type="button"
                  onClick={closeTranslationModal}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
