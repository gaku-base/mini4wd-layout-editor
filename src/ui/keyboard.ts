export interface KeyboardShortcutEvent {
  readonly key: string
  readonly code: string
  readonly target: unknown
}

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
