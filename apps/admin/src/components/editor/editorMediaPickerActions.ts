export type EditorMediaField = 'src' | 'video' | 'audio' | 'embed' | 'interactiveFallbackImage' | 'downloadFile';
export type EditorMediaPickerTarget = EditorMediaField | 'font';
export type EditorMediaPickerMode = 'library' | 'upload';

interface EditorMediaPickerActionInput {
  field: EditorMediaPickerTarget;
  mode: EditorMediaPickerMode;
  disabled?: boolean;
  canViewMedia?: boolean;
  canCreateMedia?: boolean;
  viewDisabledReason?: string;
  createDisabledReason?: string;
}

const editorMediaPickerTargetLabel = (field: EditorMediaPickerTarget): string => {
  if (field === 'video') return 'video';
  if (field === 'audio') return 'audio';
  if (field === 'embed') return 'embed media';
  if (field === 'interactiveFallbackImage') return 'fallback image';
  if (field === 'downloadFile') return 'download file';
  if (field === 'font') return 'font file';
  return 'image';
};

export const buildEditorMediaPickerAction = ({
  field,
  mode,
  disabled = false,
  canViewMedia = true,
  canCreateMedia = true,
  viewDisabledReason = 'You do not have permission to view media.',
  createDisabledReason = 'You do not have permission to upload media.',
}: EditorMediaPickerActionInput) => {
  const targetLabel = editorMediaPickerTargetLabel(field);
  const actionLabel = `${mode === 'upload' ? 'Upload' : 'Select'} ${targetLabel}`;
  const disabledReason = disabled
    ? 'Inspector is read-only for this element.'
    : !canViewMedia
      ? viewDisabledReason
      : mode === 'upload' && !canCreateMedia
        ? createDisabledReason
        : '';

  return {
    actionLabel,
    actionState: disabledReason ? 'blocked' : 'ready',
    actionStatus: disabledReason
      ? `${actionLabel} unavailable: ${disabledReason}`
      : `${actionLabel} available from the media library.`,
    disabledReason,
  };
};
