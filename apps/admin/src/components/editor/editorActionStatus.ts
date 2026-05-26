export type EditorActionState = 'ready' | 'selected' | 'blocked' | 'busy';

export interface EditorActionStatusInput {
  label: string;
  disabledReason?: string;
  selected?: boolean;
  busy?: boolean;
  readyStatus?: string;
  selectedStatus?: string;
  busyStatus?: string;
  selectedStatusFallback?: string;
}

export const buildEditorActionStatus = ({
  label,
  disabledReason = '',
  selected = false,
  busy = false,
  readyStatus,
  selectedStatus,
  busyStatus,
  selectedStatusFallback,
}: EditorActionStatusInput) => {
  const actionState: EditorActionState = busy
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
        ? selectedStatus || selectedStatusFallback || `${label} selected.`
        : readyStatus || `${label} available.`;

  return {
    actionState,
    actionStatus,
    disabledReason,
  };
};
