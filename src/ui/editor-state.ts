import { rotation45, type Point3D, type Rotation45 } from '../domain/geometry'
import {
  createLayoutHistory,
  deletePartsWithHistory,
  getConnectedComponentPartIds,
  movePartsWithHistory,
  placePartWithHistory,
  redoLayoutHistory,
  removeLastPlacementWithHistory,
  undoLayoutHistory,
  type LayoutHistory,
  type LayoutPlacementRequest,
} from '../domain/parts'
import { reconcileSelection } from './selection'

export type EditorMode = 'place' | 'select' | 'move'

export interface EditorState {
  readonly history: LayoutHistory
  readonly selectedPartIds: readonly string[]
  readonly mode: EditorMode
  readonly rotation: Rotation45
  readonly message: string
}

export type EditorAction =
  | { readonly type: 'set-mode'; readonly mode: EditorMode }
  | {
      readonly type: 'set-selection'
      readonly partIds: readonly string[]
      readonly message?: string
    }
  | { readonly type: 'rotate'; readonly delta: -45 | 45 }
  | { readonly type: 'place'; readonly request: LayoutPlacementRequest }
  | {
      readonly type: 'move'
      readonly partIds: readonly string[]
      readonly translation: Point3D
      readonly snapDistance: number
    }
  | { readonly type: 'delete-selection' }
  | { readonly type: 'remove-last-placement' }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }

export function createEditorState(): EditorState {
  return {
    history: createLayoutHistory(),
    selectedPartIds: [],
    mode: 'place',
    rotation: rotation45(0),
    message: '配置モード',
  }
}

function stateAfterHistory(
  state: EditorState,
  history: LayoutHistory,
  message: string,
): EditorState {
  if (history === state.history) {
    return state
  }

  return {
    ...state,
    history,
    selectedPartIds: reconcileSelection(
      state.selectedPartIds,
      history.present.layout,
    ),
    message,
  }
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  try {
    switch (action.type) {
      case 'set-mode':
        return {
          ...state,
          mode: action.mode,
          message:
            action.mode === 'move'
              ? '移動モード: 選択パーツをドラッグ'
              : action.mode === 'select'
                ? '選択モード'
                : '配置モード',
        }
      case 'set-selection':
        return {
          ...state,
          selectedPartIds: reconcileSelection(
            action.partIds,
            state.history.present.layout,
          ),
          message: action.message ?? `${action.partIds.length}個を選択`,
        }
      case 'rotate':
        return {
          ...state,
          rotation: rotation45(state.rotation + action.delta),
          message: `配置角度 ${rotation45(state.rotation + action.delta)}°`,
        }
      case 'place':
        return stateAfterHistory(
          state,
          placePartWithHistory(state.history, action.request),
          `${action.request.partKey}を配置`,
        )
      case 'move': {
        const expanded = getConnectedComponentPartIds(
          state.history.present.layout,
          action.partIds,
        )
        const history = movePartsWithHistory(state.history, expanded, {
          translation: action.translation,
          snapDistance: action.snapDistance,
        })
        const moved = stateAfterHistory(
          { ...state, selectedPartIds: expanded },
          history,
          `${expanded.length}個の接続グループを移動`,
        )
        return moved
      }
      case 'delete-selection':
        if (state.selectedPartIds.length === 0) return state
        return {
          ...stateAfterHistory(
            state,
            deletePartsWithHistory(state.history, state.selectedPartIds),
            `${state.selectedPartIds.length}個を削除`,
          ),
          selectedPartIds: [],
        }
      case 'remove-last-placement':
        return stateAfterHistory(
          state,
          removeLastPlacementWithHistory(state.history),
          '最後に配置したパーツを削除',
        )
      case 'undo':
        return stateAfterHistory(state, undoLayoutHistory(state.history), 'Undo')
      case 'redo':
        return stateAfterHistory(state, redoLayoutHistory(state.history), 'Redo')
    }
  } catch {
    return state
  }
}
