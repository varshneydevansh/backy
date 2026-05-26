import { Image, Link, X } from 'lucide-react';

export type RichTextInsertDialogMode = 'link' | 'image';

export interface RichTextInsertDialogState {
  mode: RichTextInsertDialogMode;
  value: string;
  error?: string;
}

interface RichTextInsertDialogProps {
  dialog: RichTextInsertDialogState;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

const RICH_TEXT_INSERT_DIALOG_ACTION_STATUS_ID = 'rich-text-insert-dialog-action-status';
const RICH_TEXT_INSERT_DIALOG_TITLE_ID = 'rich-text-insert-dialog-title';
const RICH_TEXT_INSERT_DIALOG_INPUT_ID = 'rich-text-insert-dialog-input';
const RICH_TEXT_INSERT_DIALOG_ERROR_ID = 'rich-text-insert-dialog-error';
const RICH_TEXT_INSERT_DIALOG_DISMISS_STATUS = 'Close insert dialog without changing rich text.';

const getRichTextInsertDialogConfig = (mode: RichTextInsertDialogMode) => (
  mode === 'link'
    ? {
      title: 'Insert link',
      description: 'Apply a URL to the selected text or current caret position.',
      fieldLabel: 'Link URL',
      placeholder: 'https://example.com',
      emptyMessage: 'Enter a link URL before inserting.',
      confirmLabel: 'Insert link',
      readyMessage: 'Insert link into rich text.',
    }
    : {
      title: 'Insert image',
      description: 'Add an image from a URL or site-relative media path.',
      fieldLabel: 'Image URL',
      placeholder: 'https://example.com/image.jpg',
      emptyMessage: 'Enter an image URL before inserting.',
      confirmLabel: 'Insert image',
      readyMessage: 'Insert image into rich text.',
    }
);

const isInvalidImagePath = (mode: RichTextInsertDialogMode, value: string): boolean => (
  mode === 'image'
  && value.length > 0
  && !/^https?:\/\//i.test(value)
  && !value.startsWith('/')
);

export function getRichTextInsertDialogEmptyMessage(mode: RichTextInsertDialogMode): string {
  return getRichTextInsertDialogConfig(mode).emptyMessage;
}

export function isRichTextInsertDialogImagePathInvalid(mode: RichTextInsertDialogMode, value: string): boolean {
  return isInvalidImagePath(mode, value.trim());
}

export function RichTextInsertDialog({
  dialog,
  onValueChange,
  onClose,
  onConfirm,
}: RichTextInsertDialogProps) {
  const config = getRichTextInsertDialogConfig(dialog.mode);
  const value = dialog.value.trim();
  const imagePathInvalid = isInvalidImagePath(dialog.mode, value);
  const validationMessage = dialog.error
    || (!value ? config.emptyMessage : '')
    || (imagePathInvalid ? 'Use an absolute URL or a site-relative path.' : '');
  const actionState = validationMessage ? 'blocked' : 'ready';
  const actionStatus = validationMessage || config.readyMessage;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={RICH_TEXT_INSERT_DIALOG_TITLE_ID}
      aria-describedby={RICH_TEXT_INSERT_DIALOG_ACTION_STATUS_ID}
      data-testid="rich-text-insert-dialog"
      data-insert-mode={dialog.mode}
      data-action-state={actionState}
      data-action-status={actionStatus}
    >
      <span
        id={RICH_TEXT_INSERT_DIALOG_ACTION_STATUS_ID}
        className="sr-only"
        data-testid="rich-text-insert-dialog-action-status"
        aria-live="polite"
      >
        {actionStatus}
      </span>
      <form
        className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-muted p-2 text-foreground">
              {dialog.mode === 'link' ? <Link className="h-5 w-5" /> : <Image className="h-5 w-5" />}
            </span>
            <div>
              <h2 id={RICH_TEXT_INSERT_DIALOG_TITLE_ID} className="text-base font-semibold text-foreground">
                {config.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {config.description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close insert dialog"
            aria-describedby={RICH_TEXT_INSERT_DIALOG_ACTION_STATUS_ID}
            data-testid="rich-text-insert-dialog-close"
            data-action-state="ready"
            data-action-status={RICH_TEXT_INSERT_DIALOG_DISMISS_STATUS}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-5 block space-y-2">
          <span className="text-xs font-semibold text-muted-foreground">
            {config.fieldLabel}
          </span>
          <input
            id={RICH_TEXT_INSERT_DIALOG_INPUT_ID}
            type="text"
            value={dialog.value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder={config.placeholder}
            aria-invalid={Boolean(dialog.error || imagePathInvalid)}
            aria-describedby={[
              RICH_TEXT_INSERT_DIALOG_ACTION_STATUS_ID,
              dialog.error ? RICH_TEXT_INSERT_DIALOG_ERROR_ID : '',
            ].filter(Boolean).join(' ')}
            data-testid="rich-text-insert-dialog-input"
            data-action-state={actionState}
            data-action-status={actionStatus}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
            autoFocus
          />
        </label>

        {dialog.error && (
          <div
            id={RICH_TEXT_INSERT_DIALOG_ERROR_ID}
            className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            data-testid="rich-text-insert-dialog-error"
            role="alert"
          >
            {dialog.error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-describedby={RICH_TEXT_INSERT_DIALOG_ACTION_STATUS_ID}
            data-testid="rich-text-insert-dialog-cancel"
            data-action-state="ready"
            data-action-status={RICH_TEXT_INSERT_DIALOG_DISMISS_STATUS}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            aria-describedby={RICH_TEXT_INSERT_DIALOG_ACTION_STATUS_ID}
            data-testid="rich-text-insert-dialog-confirm"
            data-action-state={actionState}
            data-action-status={actionStatus}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {config.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
