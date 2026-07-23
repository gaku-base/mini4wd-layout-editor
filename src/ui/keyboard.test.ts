import { describe, expect, it } from 'vitest'
import { paletteIndexFromKeyboardEvent } from './keyboard'

function keyboardEvent(
  code: string,
  key = '',
  target: unknown = null,
) {
  return { code, key, target }
}

describe('palette keyboard shortcuts', () => {
  it('maps Digit1 through Digit9 to palette indexes', () => {
    for (let digit = 1; digit <= 9; digit += 1) {
      expect(paletteIndexFromKeyboardEvent(keyboardEvent(`Digit${digit}`))).toBe(digit - 1)
    }
  })

  it('maps Numpad1 through Numpad9 to palette indexes', () => {
    for (let digit = 1; digit <= 9; digit += 1) {
      expect(paletteIndexFromKeyboardEvent(keyboardEvent(`Numpad${digit}`))).toBe(digit - 1)
    }
  })

  it('falls back to KeyboardEvent.key and leaves unrelated keys unhandled', () => {
    expect(paletteIndexFromKeyboardEvent(keyboardEvent('', '4'))).toBe(3)
    expect(paletteIndexFromKeyboardEvent(keyboardEvent('Digit0', '0'))).toBeNull()
    expect(paletteIndexFromKeyboardEvent(keyboardEvent('KeyQ', 'q'))).toBeNull()
  })

  it('disables shortcuts while editing form fields or contenteditable content', () => {
    for (const target of [
      { tagName: 'input' },
      { tagName: 'textarea' },
      { tagName: 'select' },
      { tagName: 'div', isContentEditable: true },
    ]) {
      expect(paletteIndexFromKeyboardEvent(keyboardEvent('Digit1', '1', target))).toBeNull()
    }
  })
})
