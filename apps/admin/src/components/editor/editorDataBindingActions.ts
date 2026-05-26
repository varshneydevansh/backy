import {
  buildEditorActionStatus,
  type EditorActionStatusInput,
} from './editorActionStatus';

export type EditorDataBindingActionState = 'ready' | 'selected' | 'blocked' | 'busy';

type EditorDataBindingActionInput = Omit<EditorActionStatusInput, 'selectedStatusFallback'>;

export const buildEditorDataBindingAction = (input: EditorDataBindingActionInput) => buildEditorActionStatus({
  ...input,
  selectedStatusFallback: `${input.label} already applied.`,
});
