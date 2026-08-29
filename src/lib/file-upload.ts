export const filePickerAccept = [
  'image/*',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  '.txt',
].join(',')

export type FilePickerOptions = {
  capture?: 'user' | 'environment'
  accept?: string
}

export function filePickerProps(options: FilePickerOptions = {}) {
  return {
    type: 'file' as const,
    accept: options.accept ?? filePickerAccept,
    ...(options.capture ? { capture: options.capture } : {}),
  }
}

export function validateBrowserFile(file: File, maxSizeMb = 15): string | null {
  if (!file.type) return 'El archivo no tiene un tipo válido.'
  if (file.size <= 0) return 'El archivo está vacío.'
  if (file.size > maxSizeMb * 1024 * 1024) return `El archivo no puede superar ${maxSizeMb} MB.`
  return null
}

export async function fileToFormData(
  file: File,
  options: { visibility?: 'public' | 'private'; thumbnail?: boolean; metadata?: Record<string, string> } = {},
): Promise<FormData> {
  const form = new FormData()
  form.set('file', file)
  form.set('visibility', options.visibility ?? 'private')
  form.set('thumbnail', String(options.thumbnail ?? false))
  if (options.metadata) form.set('metadata', JSON.stringify(options.metadata))
  return form
}
