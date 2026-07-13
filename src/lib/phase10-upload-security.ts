import path from 'node:path'

export const MAX_PHASE10_MATERIAL_SIZE_BYTES = 25 * 1024 * 1024
export const MAX_PHASE10_VIDEO_SIZE_BYTES = 250 * 1024 * 1024

const EXECUTABLE_EXTENSIONS = new Set([
  'exe',
  'msi',
  'bat',
  'cmd',
  'ps1',
  'sh',
  'com',
  'scr',
  'dll',
  'jar',
  'apk',
  'app',
])

const PHASE10_MATERIAL_MIME_ALLOWLIST: Record<string, string[]> = {
  pdf: ['application/pdf'],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  txt: ['text/plain'],
  csv: ['text/csv', 'application/csv', 'text/plain'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  mp4: ['video/mp4'],
  zip: ['application/zip', 'application/x-zip-compressed'],
}

const PHASE10_VIDEO_MIME_ALLOWLIST: Record<string, string[]> = {
  mp4: ['video/mp4'],
  webm: ['video/webm'],
  mov: ['video/quicktime'],
}

function normalizeExtension(fileName: string) {
  return path.extname(fileName).replace(/^\./, '').trim().toLowerCase()
}

export function sanitizePhase10FileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'asset'
}

function validateAllowedMimeType(extension: string, mimeType: string, allowlist: Record<string, string[]>) {
  const allowed = allowlist[extension]
  if (!allowed || allowed.length === 0) return false
  return allowed.includes(mimeType.trim().toLowerCase())
}

export function validatePhase10MaterialUpload(file: { name: string; type: string; size: number }) {
  const extension = normalizeExtension(file.name)
  const mimeType = (file.type || 'application/octet-stream').trim().toLowerCase()

  if (!extension) {
    throw new Error('Uploaded material must include a file extension.')
  }
  if (EXECUTABLE_EXTENSIONS.has(extension)) {
    throw new Error('Executable files are not allowed for LMS materials.')
  }
  if (file.size <= 0 || file.size > MAX_PHASE10_MATERIAL_SIZE_BYTES) {
    throw new Error(`LMS material size must be between 1 byte and ${MAX_PHASE10_MATERIAL_SIZE_BYTES} bytes.`)
  }
  if (!validateAllowedMimeType(extension, mimeType, PHASE10_MATERIAL_MIME_ALLOWLIST)) {
    throw new Error(`Unsupported LMS material type for .${extension} uploads.`)
  }

  return {
    safeFileName: sanitizePhase10FileName(file.name),
    extension,
    mimeType,
  }
}

export function validatePhase10VideoUpload(file: { name: string; type: string; size: number }) {
  const extension = normalizeExtension(file.name)
  const mimeType = (file.type || 'application/octet-stream').trim().toLowerCase()

  if (!extension) {
    throw new Error('Uploaded video must include a file extension.')
  }
  if (EXECUTABLE_EXTENSIONS.has(extension)) {
    throw new Error('Executable files are not allowed for LMS videos.')
  }
  if (file.size <= 0 || file.size > MAX_PHASE10_VIDEO_SIZE_BYTES) {
    throw new Error(`LMS video size must be between 1 byte and ${MAX_PHASE10_VIDEO_SIZE_BYTES} bytes.`)
  }
  if (!validateAllowedMimeType(extension, mimeType, PHASE10_VIDEO_MIME_ALLOWLIST)) {
    throw new Error(`Unsupported LMS video type for .${extension} uploads.`)
  }

  return {
    safeFileName: sanitizePhase10FileName(file.name),
    extension,
    mimeType,
  }
}
