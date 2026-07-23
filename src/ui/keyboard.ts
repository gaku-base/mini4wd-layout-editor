export interface KeyboardShortcutEvent {
  readonly key: string
  readonly code: string
  readonly target: unknown
  readonly ctrlKey?: boolean
  readonly shiftKey?: boolean
  readonly altKey?: boolean
  readonly metaKey?: boolean
}

export type EditorKeyboardShortcut =
  | 'move-mode'
  | 'delete-selection'
  | 'remove-last-placement'
  | 'undo'
  | 'redo'
  | 'rotate-left'
  | 'rotate-right'

const EDITABLE_TAG_NAMES = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function isEditableKeyboardTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) {
    return false
  }

  const candidate = target as {
    readonly tagName?: unknown
    readonly isContentEditable?: unknown
  }

  if (candidate.isContentEditable === true) {
    return true
  }

  return (
    typeof candidate.tagName === 'string' &&
    EDITABLE_TAG_NAMES.has(candidate.tagName.toUpperCase())
  )
}

function digitFromCode(code: string): number | null {
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(code)
  return match === null ? null : Number(match[1])
}

function digitFromKey(key: string): number | null {
  return /^[1-9]$/.test(key) ? Number(key) : null
}

/** Returns the zero-based palette index handled by the keyboard event. */
export function paletteIndexFromKeyboardEvent(event: KeyboardShortcutEvent): number | null {
  if (isEditableKeyboardTarget(event.target)) {
    return null
  }

  const digit = digitFromCode(event.code) ?? digitFromKey(event.key)
  return digit === null ? null : digit - 1
}

export function editorShortcutFromKeyboardEvent(
  event: KeyboardShortcutEvent,
): EditorKeyboardShortcut | null {
  if (isEditableKeyboardTarget(event.target)) {
    return null
  }

  const key = event.key.toLowerCase()
  const ctrl = event.ctrlKey === true
  const shift = event.shiftKey === true
  const hasUnsupportedModifier = event.altKey === true || event.metaKey === true

  if (hasUnsupportedModifier) {
    return null
  }

  if (ctrl) {
    if (key === 'z') return shift ? 'redo' : 'undo'
    if (key === 'y' && !shift) return 'redo'
    return null
  }

  if (shift) {
    return null
  }

  if (key === 'q') return 'move-mode'
  if (key === 'w') return 'delete-selection'
  if (key === 'r') return 'remove-last-placement'
  if (key === 'z') return 'rotate-left'
  if (key === 'x') return 'rotate-right'
  return null
}
