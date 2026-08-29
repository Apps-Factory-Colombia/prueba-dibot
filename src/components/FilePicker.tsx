import { useId } from 'react'
import { filePickerAccept, filePickerProps, validateBrowserFile } from '../lib/file-upload'

type FilePickerProps = {
  onFile: (file: File) => void
  accept?: string
  capture?: 'user' | 'environment'
  disabled?: boolean
  label?: string
  onError?: (message: string) => void
}

/** Mobile-first picker: accepts the gallery and can request the camera on mobile. */
export function FilePicker({
  onFile,
  accept = filePickerAccept,
  capture,
  disabled = false,
  label = 'Subir archivo',
  onError,
}: FilePickerProps) {
  const inputId = useId()
  return (
    <label htmlFor={inputId}>
      <span>{label}</span>
      <input
        id={inputId}
        {...filePickerProps({ accept, capture })}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          const error = validateBrowserFile(file)
          if (error) {
            event.target.value = ''
            onError?.(error)
            return
          }
          onFile(file)
          event.target.value = ''
        }}
      />
    </label>
  )
}
