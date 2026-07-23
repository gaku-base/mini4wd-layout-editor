import { describe, expect, it } from 'vitest'
import { point3D, rotation45 } from '../domain/geometry'
import { createEditorState, editorReducer, type EditorState } from './editor-state'

function stateWithStart(): EditorState {
  return editorReducer(createEditorState(), {
    type: 'place',
    request: {
      id: 'start-1',
      partKey: 'start',
      freePose: {
        position: point3D(100, 100, 0),
        heading: rotation45(0),
      },
    },
  })
}

function stateWithStraight(): EditorState {
  return editorReducer(stateWithStart(), {
    type: 'place',
    request: {
      id: 'straight-1',
      partKey: 'straight',
      snapTarget: { partId: 'start-1', connectorId: 'exit' },
    },
  })
}

describe('editor state outside layout history', () => {
  it('does nothing when deletion is requested without a selection', () => {
    const state = stateWithStart()

    expect(editorReducer(state, { type: 'delete-selection' })).toBe(state)
  })

  it('removes stale selection IDs after Undo without recording selection itself', () => {
    let state = stateWithStraight()
    state = editorReducer(state, {
      type: 'set-selection',
      partIds: ['straight-1'],
    })
    const historyBeforeSelection = state.history
    state = editorReducer(state, { type: 'undo' })

    expect(historyBeforeSelection.past).toHaveLength(2)
    expect(state.selectedPartIds).toEqual([])
    expect(state.history.present.layout.parts.map((part) => part.id)).toEqual([
      'start-1',
    ])
  })

  it('keeps selection outside history when a deletion is undone', () => {
    let state = stateWithStraight()
    state = editorReducer(state, {
      type: 'set-selection',
      partIds: ['straight-1'],
    })
    state = editorReducer(state, { type: 'delete-selection' })
    state = editorReducer(state, { type: 'undo' })

    expect(state.selectedPartIds).toEqual([])
    expect(state.history.present.layout.parts.map((part) => part.id)).toEqual([
      'start-1',
      'straight-1',
    ])
    expect(state.history.present.layout.connections).toHaveLength(1)
  })
})
