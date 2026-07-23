import { describe, expect, it } from 'vitest'
import {
  editorShortcutFromKeyboardEvent,
  paletteIndexFromKeyboardEvent,
} from './keyboard'

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

describe('editing keyboard shortcuts', () => {
  it('maps Q, W, R, Undo, and both Redo forms', () => {
    expect(editorShortcutFromKeyboardEvent(keyboardEvent('KeyQ', 'q'))).toBe(
      'move-mode',
    )
    expect(editorShortcutFromKeyboardEvent(keyboardEvent('KeyW', 'w'))).toBe(
      'delete-selection',
    )
    expect(editorShortcutFromKeyboardEvent(keyboardEvent('KeyR', 'r'))).toBe(
      'remove-last-placement',
    )
    expect(
      editorShortcutFromKeyboardEvent({
        ...keyboardEvent('KeyZ', 'z'),
        ctrlKey: true,
      }),
    ).toBe('undo')
    expect(
      editorShortcutFromKeyboardEvent({
        ...keyboardEvent('KeyY', 'y'),
        ctrlKey: true,
      }),
    ).toBe('redo')
    expect(
      editorShortcutFromKeyboardEvent({
        ...keyboardEvent('KeyZ', 'z'),
        ctrlKey: true,
        shiftKey: true,
      }),
    ).toBe('redo')
  })

  it('keeps plain Z/X rotation separate from Undo/Redo', () => {
    expect(editorShortcutFromKeyboardEvent(keyboardEvent('KeyZ', 'z'))).toBe(
      'rotate-left',
    )
    expect(editorShortcutFromKeyboardEvent(keyboardEvent('KeyX', 'x'))).toBe(
      'rotate-right',
    )
  })

  it('disables Q/W/R/Undo/Redo while editing an input target', () => {
    const events = [
      keyboardEvent('KeyQ', 'q', { tagName: 'input' }),
      keyboardEvent('KeyW', 'w', { tagName: 'textarea' }),
      keyboardEvent('KeyR', 'r', { tagName: 'select' }),
      {
        ...keyboardEvent('KeyZ', 'z', {
          tagName: 'div',
          isContentEditable: true,
        }),
        ctrlKey: true,
      },
      {
        ...keyboardEvent('KeyY', 'y', { tagName: 'input' }),
        ctrlKey: true,
      },
    ]

    for (const event of events) {
      expect(editorShortcutFromKeyboardEvent(event)).toBeNull()
    }
  })
})
