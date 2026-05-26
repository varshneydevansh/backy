import {
  buildEditorActionStatus,
  type EditorActionStatusInput,
} from './editorActionStatus';

export type EditorFormBuilderActionState = 'ready' | 'selected' | 'blocked' | 'busy';

type EditorFormBuilderActionInput = Omit<EditorActionStatusInput, 'selectedStatusFallback'>;

export const buildEditorFormBuilderAction = (input: EditorFormBuilderActionInput) => buildEditorActionStatus(input);
