import path from 'path'

export const MAX_EBOOK_SIZE = 20 * 1024 * 1024
export const EBOOK_DIR = path.join(process.cwd(), 'public', 'uploads', 'ebooks')

export function sanitizeEbookFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').toLowerCase()
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${bytes} B`
}
