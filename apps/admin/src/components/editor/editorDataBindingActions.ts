export type EditorDataBindingActionState = 'ready' | 'selected' | 'blocked' | 'busy';

interface EditorDataBindingActionInput {
  label: string;
  disabledReason?: string;
  selected?: boolean;
  busy?: boolean;
  readyStatus?: string;
  selectedStatus?: string;
  busyStatus?: string;
}

export const buildEditorDataBindingAction = ({
  label,
  disabledReason = '',
  selected = false,
  busy = false,
  readyStatus,
  selectedStatus,
  busyStatus,
}: EditorDataBindingActionInput) => {
  const actionState: EditorDataBindingActionState = busy
    ? 'busy'
    : disabledReason
      ? 'blocked'
      : selected
        ? 'selected'
        : 'ready';
  const actionStatus = busy
    ? busyStatus || `${label} is in progress.`
    : disabledReason
      ? `${label} unavailable: ${disabledReason}`
      : selected
        ? selectedStatus || `${label} already applied.`
        : readyStatus || `${label} available.`;

  return {
    actionState,
    actionStatus,
    disabledReason,
  };
};
