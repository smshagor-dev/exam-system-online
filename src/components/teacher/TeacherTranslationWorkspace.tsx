/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
// @ts-nocheck
'use client'

import { TranslationStatus } from '@prisma/client'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

type LanguageOption = {
  id: string
  name: string
  code: string
}

type EntityKey =
  | 'questions'
  | 'question-options'
  | 'exams'
  | 'coursework-rules'
  | 'coursework-assignments'
  | 'ebooks'

export type TranslationWorkspaceItemSummary = {
  id: string
  subjectName?: string
  studentName?: string
  baseLanguageName?: string
  sourceText?: string
  sourceTitle?: string
  sourceRules?: string
  preview?: any
  completeness: {
    isComplete: boolean
    missingFields: Array<{ field: string; message: string }>
  }
}

type DetailState = {
  baseLanguageId?: string
  languageId: string
  translation: any
  optionTranslations?: Array<{ optionId: string; orderIndex: number; text: string; status: TranslationStatus }>
  completeness: {
    isComplete: boolean
    missingFields: Array<{ field: string; message: string }>
  }
  preview: any
  source: any
}

const ENTITY_OPTIONS: Array<{ id: EntityKey; label: string }> = [
  { id: 'questions', label: 'Questions' },
  { id: 'exams', label: 'Exams' },
  { id: 'coursework-rules', label: 'Coursework Rules' },
  { id: 'coursework-assignments', label: 'Coursework Assignments' },
  { id: 'ebooks', label: 'Ebooks' },
]

export default function TeacherTranslationWorkspace({
  languages,
  initialEntity,
  initialItems,
}: {
  languages: LanguageOption[]
  initialEntity: EntityKey
  initialItems: TranslationWorkspaceItemSummary[]
}) {
  const [entity, setEntity] = useState<EntityKey>(initialEntity)
  const [selectedLanguageId, setSelectedLanguageId] = useState(languages[0]?.id ?? '')
  const [missingOnly, setMissingOnly] = useState(false)
  const [items, setItems] = useState<Record<string, TranslationWorkspaceItemSummary[]>>({ [initialEntity]: initialItems })
  const [loadingList, setLoadingList] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState(initialItems[0]?.id ?? '')
  const [detail, setDetail] = useState<DetailState | null>(null)
  const [detailDraft, setDetailDraft] = useState<any>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const currentItems = items[entity] ?? []
  const selectedItem = currentItems.find((item) => item.id === selectedItemId) ?? currentItems[0] ?? null

  useEffect(() => {
    if (!selectedLanguageId) return

    let active = true
    setLoadingList(true)
    setError(null)

    fetch(`/api/teacher/translations/${entity}?languageId=${selectedLanguageId}&missingOnly=${missingOnly}`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load translations')
        }

        if (!active) return

        setItems((current) => ({
          ...current,
          [entity]: data.items,
        }))
        setSelectedItemId((currentSelected) => {
          if (data.items.some((item: ItemSummary) => item.id === currentSelected)) {
            return currentSelected
          }

          return data.items[0]?.id ?? ''
        })
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load translations')
        }
      })
      .finally(() => {
        if (active) {
          setLoadingList(false)
        }
      })

    return () => {
      active = false
    }
  }, [entity, selectedLanguageId, missingOnly])

  useEffect(() => {
    if (!selectedItemId || !selectedLanguageId) {
      setDetail(null)
      setDetailDraft(null)
      return
    }

    let active = true
    setLoadingDetail(true)
    setError(null)

    fetch(`/api/teacher/translations/${entity}/${selectedItemId}?languageId=${selectedLanguageId}`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load translation detail')
        }

        if (!active) return
        setDetail(data)
        setDetailDraft({
          ...data.translation,
          languageId: selectedLanguageId,
          options: data.optionTranslations ?? [],
        })
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load translation detail')
        }
      })
      .finally(() => {
        if (active) {
          setLoadingDetail(false)
        }
      })

    return () => {
      active = false
    }
  }, [entity, selectedItemId, selectedLanguageId])

  const missingMessages = useMemo(
    () => detail?.completeness.missingFields.map((item) => item.message) ?? [],
    [detail]
  )

  function updateDraft(field: string, value: unknown) {
    setDetailDraft((current: any) => ({
      ...current,
      [field]: value,
    }))
  }

  function updateOption(optionId: string, value: string) {
    setDetailDraft((current: any) => ({
      ...current,
      options: (current?.options ?? []).map((option: any) =>
        option.optionId === optionId ? { ...option, text: value } : option
      ),
    }))
  }

  async function saveTranslation(status: TranslationStatus) {
    if (!selectedItemId || !detailDraft) return

    setSaving(true)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch(`/api/teacher/translations/${entity}/${selectedItemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...detailDraft,
          languageId: selectedLanguageId,
          status,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(
          data.error ||
            (data.completeness?.missingFields?.map((item: any) => item.message).join(' ') ??
              'Failed to save translation')
        )
      }

      setDetail((current) =>
        current
          ? {
              ...current,
              completeness: data.completeness,
              preview: data.preview,
            }
          : current
      )
      setMessage(status === TranslationStatus.COMPLETE ? 'Marked complete.' : 'Draft saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save translation')
    } finally {
      setSaving(false)
    }
  }

  async function archiveTranslation() {
    if (!selectedItemId) return

    setSaving(true)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch(
        `/api/teacher/translations/${entity}/${selectedItemId}?languageId=${selectedLanguageId}`,
        {
          method: 'DELETE',
        }
      )
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to archive translation')
      }

      setMessage('Translation archived safely.')
      setDetail(null)
      setDetailDraft(null)
      setSelectedItemId('')
      setItems((current) => ({
        ...current,
        [entity]: (current[entity] ?? []).filter((item) => item.id !== selectedItemId),
      }))
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Failed to archive translation')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Translation Workspace</h1>
        <p className="mt-1 text-sm text-slate-500">
          Save drafts, preview selected-language content, and only mark translations complete once every required field is truly translated.
        </p>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {ENTITY_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setEntity(option.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                entity === option.id
                  ? 'bg-sky-600 text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-sky-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {languages.map((language) => (
            <button
              key={language.id}
              type="button"
              onClick={() => setSelectedLanguageId(language.id)}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                selectedLanguageId === language.id
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {language.name}
            </button>
          ))}

          <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={missingOnly}
              onChange={(event) => setMissingOnly(event.target.checked)}
            />
            Missing only
          </label>
        </div>
      </section>

      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              {ENTITY_OPTIONS.find((option) => option.id === entity)?.label}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {loadingList ? 'Refreshing list…' : `${currentItems.length} item(s)`}
            </p>
          </div>

          {currentItems.length === 0 ? (
            <div className="p-8 text-sm text-slate-500">No items found for the selected filter.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {currentItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItemId(item.id)}
                  className={`block w-full px-5 py-4 text-left transition ${
                    selectedItemId === item.id ? 'bg-sky-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {item.studentName || item.subjectName || item.sourceTitle || 'Item'}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                    {item.sourceText || item.sourceTitle || item.sourceRules || item.preview?.title || 'Open to translate'}
                  </p>
                  <p className={`mt-2 text-xs font-medium ${item.completeness.isComplete ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {item.completeness.isComplete
                      ? 'Complete'
                      : `${item.completeness.missingFields.length} missing field(s)`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          {!selectedItem ? (
            <div className="p-10 text-sm text-slate-500">Choose an item to start translating.</div>
          ) : loadingDetail || !detail || !detailDraft ? (
            <div className="p-10 text-sm text-slate-500">Loading translation detail…</div>
          ) : (
            <div className="space-y-6 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    {selectedItem.studentName || selectedItem.subjectName || selectedItem.sourceTitle || 'Translation'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Base language: {selectedItem.baseLanguageName ?? 'N/A'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveTranslation(TranslationStatus.DRAFT)}
                    disabled={saving}
                    className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveTranslation(TranslationStatus.COMPLETE)}
                    disabled={saving}
                    className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
                  >
                    Mark Complete
                  </button>
                  {selectedLanguageId !== detail.preview.languageId ? null : null}
                  <button
                    type="button"
                    onClick={() => void archiveTranslation()}
                    disabled={saving || selectedLanguageId === detail.baseLanguageId}
                    className="rounded-2xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                  >
                    Archive
                  </button>
                </div>
              </div>

              {missingMessages.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {missingMessages.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  Translation is complete for this selected language.
                </div>
              )}

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-slate-700">
                    Source Preview
                    <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      <pre className="whitespace-pre-wrap font-sans">
                        {JSON.stringify(detail.source, null, 2)}
                      </pre>
                    </div>
                  </label>

                  {entity === 'questions' ? (
                    <>
                      <Field label="Question Text">
                        <textarea
                          value={detailDraft.text ?? ''}
                          onChange={(event) => updateDraft('text', event.target.value)}
                          rows={6}
                          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        />
                      </Field>
                      <Field label="Expected Answer">
                        <textarea
                          value={detailDraft.expectedAnswer ?? ''}
                          onChange={(event) => updateDraft('expectedAnswer', event.target.value)}
                          rows={3}
                          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        />
                      </Field>
                      <Field label="Explanation">
                        <textarea
                          value={detailDraft.explanation ?? ''}
                          onChange={(event) => updateDraft('explanation', event.target.value)}
                          rows={3}
                          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        />
                      </Field>
                      <Field label="Keywords">
                        <input
                          type="text"
                          value={Array.isArray(detailDraft.keywords) ? detailDraft.keywords.join(', ') : ''}
                          onChange={(event) =>
                            updateDraft(
                              'keywords',
                              event.target.value
                                .split(',')
                                .map((entry) => entry.trim())
                                .filter(Boolean)
                            )
                          }
                          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        />
                      </Field>
                      <Field label="MCQ Option Translations">
                        <div className="mt-2 space-y-3">
                          {(detailDraft.options ?? []).map((option: any) => (
                            <input
                              key={option.optionId}
                              type="text"
                              value={option.text}
                              onChange={(event) => updateOption(option.optionId, event.target.value)}
                              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                              placeholder={`Option ${option.orderIndex + 1}`}
                            />
                          ))}
                        </div>
                      </Field>
                    </>
                  ) : null}

                  {entity === 'exams' ? (
                    <>
                      <Field label="Exam Title">
                        <input
                          type="text"
                          value={detailDraft.title ?? ''}
                          onChange={(event) => updateDraft('title', event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        />
                      </Field>
                      <Field label="Description">
                        <textarea
                          value={detailDraft.description ?? ''}
                          onChange={(event) => updateDraft('description', event.target.value)}
                          rows={3}
                          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        />
                      </Field>
                      <Field label="Instructions">
                        <textarea
                          value={detailDraft.instructions ?? ''}
                          onChange={(event) => updateDraft('instructions', event.target.value)}
                          rows={5}
                          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        />
                      </Field>
                    </>
                  ) : null}

                  {entity === 'coursework-rules' ? (
                    <Field label="Coursework Instructions">
                      <textarea
                        value={detailDraft.rules ?? ''}
                        onChange={(event) => updateDraft('rules', event.target.value)}
                        rows={8}
                        className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                      />
                    </Field>
                  ) : null}

                  {entity === 'coursework-assignments' ? (
                    <>
                      <Field label="Assignment Title">
                        <input
                          type="text"
                          value={detailDraft.title ?? ''}
                          onChange={(event) => updateDraft('title', event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        />
                      </Field>
                      <Field label="Translated Instructions">
                        <textarea
                          value={detailDraft.rules ?? ''}
                          onChange={(event) => updateDraft('rules', event.target.value)}
                          rows={6}
                          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        />
                      </Field>
                    </>
                  ) : null}

                  {entity === 'ebooks' ? (
                    <>
                      <Field label="Ebook Title">
                        <input
                          type="text"
                          value={detailDraft.title ?? ''}
                          onChange={(event) => updateDraft('title', event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        />
                      </Field>
                      <Field label="Description">
                        <textarea
                          value={detailDraft.description ?? ''}
                          onChange={(event) => updateDraft('description', event.target.value)}
                          rows={4}
                          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        />
                      </Field>
                      <Field label="Author">
                        <input
                          type="text"
                          value={detailDraft.author ?? ''}
                          onChange={(event) => updateDraft('author', event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        />
                      </Field>
                      <Field label="Category">
                        <input
                          type="text"
                          value={detailDraft.category ?? ''}
                          onChange={(event) => updateDraft('category', event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        />
                      </Field>
                    </>
                  ) : null}
                </div>

                <div>
                  <Field label="Selected-Language Preview">
                    <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      <pre className="whitespace-pre-wrap font-sans">
                        {JSON.stringify(detail.preview, null, 2)}
                      </pre>
                    </div>
                  </Field>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  )
}
