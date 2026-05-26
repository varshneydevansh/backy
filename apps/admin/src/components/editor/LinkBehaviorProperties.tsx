import { Download, FileText, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ElementProps } from '@/types/editor';
import {
  buildEditorMediaPickerAction,
  type EditorMediaPickerMode,
} from './editorMediaPickerActions';

interface LinkBehaviorPropertiesProps {
  prefix: 'button' | 'link';
  props: ElementProps;
  onChange: (updates: Partial<ElementProps>, options?: { staleAssetIds?: Array<unknown> }) => void;
  onOpenDownloadMedia?: (mode?: EditorMediaPickerMode, openerTestId?: string) => void;
  mediaPickerStatusId?: string;
  mediaPickerDisabled?: boolean;
  canViewMedia?: boolean;
  canCreateMedia?: boolean;
  mediaViewDisabledReason?: string;
  mediaCreateDisabledReason?: string;
  disabled?: boolean;
  includeButtonType?: boolean;
}

const parseBooleanSetting = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'off', 'no'].includes(normalized)) return false;
  }
  return fallback;
};

const cleanMediaString = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim() ? value.trim() : undefined
);

const cleanMediaStrings = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map(cleanMediaString).filter(Boolean) as string[]
    : []
);

export const clearDownloadFileProps = (): Partial<ElementProps> => ({
  fileId: undefined,
  fileIds: undefined,
  fileMediaId: undefined,
  fileMediaIds: undefined,
  fileMediaName: undefined,
  fileMediaType: undefined,
  fileMediaUrl: undefined,
  fileUrl: undefined,
  fileMediaFolderId: undefined,
  fileMediaFolderPath: undefined,
  fileMediaOrganization: undefined,
  fileMediaVisibility: undefined,
  fileMediaScope: undefined,
  fileMediaScopeTargetId: undefined,
  fileDownloadDisposition: undefined,
  fileSignedUrlRequired: undefined,
  fileSignedUrlEndpoint: undefined,
  downloadMediaId: undefined,
  downloadMediaIds: undefined,
});

export const downloadFileAssetIdsFromProps = (props: ElementProps): Array<string | undefined> => [
  cleanMediaString(props.fileMediaId),
  cleanMediaString(props.downloadMediaId),
  cleanMediaString(props.fileId),
  ...cleanMediaStrings(props.fileIds),
  ...cleanMediaStrings(props.fileMediaIds),
  ...cleanMediaStrings(props.downloadMediaIds),
];

const normalizeLinkTarget = (value: unknown): '_self' | '_blank' | '_parent' | '_top' => {
  if (value === '_blank' || value === '_parent' || value === '_top') {
    return value;
  }

  return '_self';
};

const normalizeRelForTarget = (target: unknown, value: unknown): string | undefined => {
  const raw = typeof value === 'string' ? value.trim() : '';
  const tokens = raw.split(/\s+/).filter(Boolean);

  if (target === '_blank') {
    const lowerTokens = new Set(tokens.map((token) => token.toLowerCase()));
    if (!lowerTokens.has('noopener')) {
      tokens.unshift('noopener');
    }
    if (!lowerTokens.has('noreferrer')) {
      const insertAt = tokens[0]?.toLowerCase() === 'noopener' ? 1 : 0;
      tokens.splice(insertAt, 0, 'noreferrer');
    }
  }

  return tokens.length > 0 ? tokens.join(' ') : undefined;
};

const BUTTON_ACTION_PRESETS = new Set(['custom', 'page', 'section', 'email', 'phone', 'download']);

const normalizeButtonActionPreset = (value: unknown): string => (
  typeof value === 'string' && BUTTON_ACTION_PRESETS.has(value) ? value : 'custom'
);

const normalizeButtonActionValue = (preset: string, value: unknown): string => {
  const raw = typeof value === 'string' ? value.trim() : '';

  if (!raw) return '';
  if (preset === 'section') return raw.replace(/^#/, '');
  if (preset === 'email') return raw.replace(/^mailto:/i, '');
  if (preset === 'phone') return raw.replace(/^tel:/i, '');
  return raw;
};

const buildButtonActionHref = (preset: string, value: unknown): string => {
  const actionValue = normalizeButtonActionValue(preset, value);

  if (!actionValue) return '';
  if (preset === 'section') return `#${actionValue.replace(/^#+/, '')}`;
  if (preset === 'email') return `mailto:${actionValue}`;
  if (preset === 'phone') return `tel:${actionValue.replace(/[^\d+*#]/g, '')}`;
  return actionValue;
};

export function LinkBehaviorProperties({
  prefix,
  props,
  onChange,
  onOpenDownloadMedia,
  mediaPickerStatusId,
  mediaPickerDisabled = false,
  canViewMedia = true,
  canCreateMedia = true,
  mediaViewDisabledReason,
  mediaCreateDisabledReason,
  disabled = false,
  includeButtonType = false,
}: LinkBehaviorPropertiesProps) {
  const target = normalizeLinkTarget(props.target);
  const isButton = prefix === 'button';
  const actionPreset = isButton ? normalizeButtonActionPreset(props.actionPreset) : 'custom';
  const actionValue = isButton
    ? normalizeButtonActionValue(actionPreset, props.actionValue ?? props.href)
    : '';
  const selectedFileName = cleanMediaString(props.fileMediaName) || cleanMediaString(props.fileMediaId);
  const selectedFileType = cleanMediaString(props.fileMediaType);
  const selectedFileFolder = cleanMediaString(props.fileMediaFolderPath);
  const selectedFileVisibility = cleanMediaString(props.fileMediaVisibility) || 'public';
  const linkDownloadEnabled = !isButton && parseBooleanSetting(props.download, false);
  const showDownloadFileControls = Boolean(onOpenDownloadMedia) && (
    (isButton && actionPreset === 'download') || linkDownloadEnabled || Boolean(selectedFileName)
  );
  const staleDownloadAssetIds = downloadFileAssetIdsFromProps(props);
  const getDownloadMediaAction = (mode: EditorMediaPickerMode) => buildEditorMediaPickerAction({
    field: 'downloadFile',
    mode,
    disabled: mediaPickerDisabled,
    canViewMedia,
    canCreateMedia,
    viewDisabledReason: mediaViewDisabledReason,
    createDisabledReason: mediaCreateDisabledReason,
  });
  const openDownloadMedia = (mode: EditorMediaPickerMode, openerTestId = '') => {
    if (getDownloadMediaAction(mode).disabledReason) {
      return;
    }

    onOpenDownloadMedia?.(mode, openerTestId);
  };
  const downloadMediaAction = getDownloadMediaAction('library');
  const uploadDownloadMediaAction = getDownloadMediaAction('upload');
  const behaviorActionStatusId = `editor-${prefix}-behavior-action-status`;
  const behaviorActionLabel = isButton ? 'Button behavior actions' : 'Link behavior actions';
  const behaviorDisabledReason = disabled
    ? `${isButton ? 'Button' : 'Link'} behavior is read-only for this element.`
    : '';
  const behaviorActionState = behaviorDisabledReason ? 'blocked' : 'ready';
  const selectedBehaviorActionState = (selected: boolean) => (
    behaviorDisabledReason ? 'blocked' : selected ? 'selected' : 'ready'
  );
  const behaviorActionStatus = behaviorDisabledReason
    ? `${behaviorActionLabel} unavailable: ${behaviorDisabledReason}`
    : isButton
      ? `Button behavior controls available. Current preset is ${actionPreset}${actionValue ? ` with value ${actionValue}` : ''}.`
      : `Link behavior controls available. Download file mode is ${linkDownloadEnabled ? 'enabled' : 'off'}.`;
  const behaviorControlActionStatus = (label: string, currentValue?: string) => (
    behaviorDisabledReason
      ? `${label} unavailable: ${behaviorDisabledReason}`
      : `${label} available${currentValue ? `. Current value is ${currentValue}` : ''}.`
  );
  const downloadToggleActionStatus = behaviorDisabledReason
    ? `Download file toggle unavailable: ${behaviorDisabledReason}`
    : linkDownloadEnabled
      ? 'Download file mode enabled.'
      : 'Download file mode available.';
  const downloadMediaDescribedBy = [behaviorActionStatusId, mediaPickerStatusId].filter(Boolean).join(' ');

  return (
    <div
      className="space-y-2 rounded-md border border-border bg-muted/30 p-3"
      role="group"
      aria-label={behaviorActionLabel}
      aria-describedby={behaviorActionStatusId}
      data-testid={`editor-${prefix}-behavior-actions`}
      data-action-state={behaviorActionState}
      data-action-status={behaviorActionStatus}
      data-disabled-reason={behaviorDisabledReason || undefined}
      data-action-preset={isButton ? actionPreset : undefined}
      data-action-value={isButton ? actionValue : undefined}
      data-download-enabled={linkDownloadEnabled ? 'true' : 'false'}
      data-open-target={target}
    >
      <span
        id={behaviorActionStatusId}
        className="sr-only"
        aria-live="polite"
        data-testid={`editor-${prefix}-behavior-action-status`}
      >
        {behaviorActionStatus}
      </span>
      {isButton && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Action preset
            </label>
            <select
              value={actionPreset}
              disabled={disabled}
              onChange={(e) => {
                const nextPreset = normalizeButtonActionPreset(e.target.value);
                const nextValue = normalizeButtonActionValue(nextPreset, actionValue || props.href);
                const clearsDownloadFile = nextPreset !== 'download';

                onChange({
                  ...(clearsDownloadFile ? clearDownloadFileProps() : {}),
                  actionPreset: nextPreset,
                  actionValue: nextValue,
                  href: buildButtonActionHref(nextPreset, nextValue),
                  download: nextPreset === 'download',
                }, {
                  staleAssetIds: clearsDownloadFile ? staleDownloadAssetIds : [],
                });
              }}
              data-testid="editor-button-action-preset"
              aria-describedby={behaviorActionStatusId}
              data-action-state={behaviorActionState}
              data-action-status={behaviorControlActionStatus('Button action preset', actionPreset)}
              data-disabled-reason={behaviorDisabledReason || undefined}
              data-current-preset={actionPreset}
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="custom">Custom URL</option>
              <option value="page">Site page</option>
              <option value="section">Page section</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="download">Download</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Action value
            </label>
            <input
              type="text"
              value={actionValue}
              disabled={disabled}
              onChange={(e) => {
                const nextValue = normalizeButtonActionValue(actionPreset, e.target.value);
                const clearsDownloadFile = actionPreset === 'download';

                onChange({
                  ...(clearsDownloadFile ? clearDownloadFileProps() : {}),
                  actionValue: nextValue,
                  href: buildButtonActionHref(actionPreset, nextValue),
                  download: actionPreset === 'download',
                }, {
                  staleAssetIds: clearsDownloadFile ? staleDownloadAssetIds : [],
                });
              }}
              data-testid="editor-button-action-value"
              aria-describedby={behaviorActionStatusId}
              data-action-state={behaviorActionState}
              data-action-status={behaviorControlActionStatus('Button action value', actionValue || 'empty')}
              data-disabled-reason={behaviorDisabledReason || undefined}
              data-current-value={actionValue}
              data-derived-href={buildButtonActionHref(actionPreset, actionValue)}
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
              placeholder={
                actionPreset === 'email'
                  ? 'hello@example.com'
                  : actionPreset === 'phone'
                    ? '+15551234567'
                    : actionPreset === 'section'
                      ? 'pricing'
                      : '/path-or-url'
              }
            />
          </div>
        </div>
      )}

      {!isButton && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={linkDownloadEnabled}
            disabled={disabled}
            onChange={(e) => {
              if (e.target.checked) {
                onChange({
                  actionPreset: 'download',
                  download: true,
                });
                return;
              }

              onChange({
                ...clearDownloadFileProps(),
                actionPreset: 'custom',
                download: false,
              }, {
                staleAssetIds: staleDownloadAssetIds,
              });
            }}
            data-testid="editor-link-download-toggle"
            aria-describedby={behaviorActionStatusId}
            data-action-state={selectedBehaviorActionState(linkDownloadEnabled)}
            data-action-status={downloadToggleActionStatus}
            data-disabled-reason={behaviorDisabledReason || undefined}
            className="rounded"
          />
          Download file
        </label>
      )}

      {showDownloadFileControls && (
        <div className="space-y-2 rounded-md border border-dashed border-border bg-background/70 p-2">
          <div className="flex items-start gap-2 text-xs">
            <Download className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">
                {selectedFileName || 'No file selected'}
              </p>
              <p className="truncate text-muted-foreground">
                {[selectedFileType, selectedFileFolder, selectedFileVisibility].filter(Boolean).join(' / ')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openDownloadMedia('library', `editor-${prefix}-download-media`)}
              disabled={Boolean(downloadMediaAction.disabledReason)}
              aria-describedby={downloadMediaDescribedBy}
              data-testid={`editor-${prefix}-download-media`}
              data-action-state={downloadMediaAction.actionState}
              data-action-status={downloadMediaAction.actionStatus}
              data-disabled-reason={downloadMediaAction.disabledReason || undefined}
              data-target-media-field="downloadFile"
              data-target-media-mode="library"
              title={downloadMediaAction.disabledReason || downloadMediaAction.actionLabel}
              className="flex items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileText className="h-3.5 w-3.5" />
              Choose file
            </button>
            <button
              type="button"
              onClick={() => openDownloadMedia('upload', `editor-${prefix}-upload-download-media`)}
              disabled={Boolean(uploadDownloadMediaAction.disabledReason)}
              aria-describedby={downloadMediaDescribedBy}
              data-testid={`editor-${prefix}-upload-download-media`}
              data-action-state={uploadDownloadMediaAction.actionState}
              data-action-status={uploadDownloadMediaAction.actionStatus}
              data-disabled-reason={uploadDownloadMediaAction.disabledReason || undefined}
              data-target-media-field="downloadFile"
              data-target-media-mode="upload"
              title={uploadDownloadMediaAction.disabledReason || uploadDownloadMediaAction.actionLabel}
              className="flex items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Open target
          </label>
          <select
            value={target}
            disabled={disabled}
            onChange={(e) => {
              const nextTarget = normalizeLinkTarget(e.target.value);
              onChange({
                target: nextTarget,
                rel: normalizeRelForTarget(nextTarget, props.rel),
              });
            }}
            data-testid={`editor-${prefix}-target`}
            aria-describedby={behaviorActionStatusId}
            data-action-state={behaviorActionState}
            data-action-status={behaviorControlActionStatus(`${isButton ? 'Button' : 'Link'} open target`, target)}
            data-disabled-reason={behaviorDisabledReason || undefined}
            data-current-target={target}
            className={cn(
              'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
          >
            <option value="_self">Same tab</option>
            <option value="_blank">New tab</option>
            <option value="_parent">Parent frame</option>
            <option value="_top">Top frame</option>
          </select>
        </div>
        {includeButtonType && (
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Button type
            </label>
            <select
              value={props.type || 'button'}
              disabled={disabled}
              onChange={(e) => onChange({ type: e.target.value })}
              data-testid="editor-button-type"
              aria-describedby={behaviorActionStatusId}
              data-action-state={behaviorActionState}
              data-action-status={behaviorControlActionStatus('Button type', props.type || 'button')}
              data-disabled-reason={behaviorDisabledReason || undefined}
              data-current-type={props.type || 'button'}
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="button">Button</option>
              <option value="submit">Submit</option>
              <option value="reset">Reset</option>
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Rel attribute
        </label>
        <input
          type="text"
          value={props.rel || ''}
          disabled={disabled}
          onChange={(e) => onChange({ rel: normalizeRelForTarget(target, e.target.value) })}
          data-testid={`editor-${prefix}-rel`}
          aria-describedby={behaviorActionStatusId}
          data-action-state={behaviorActionState}
          data-action-status={behaviorControlActionStatus(`${isButton ? 'Button' : 'Link'} rel attribute`, props.rel || 'empty')}
          data-disabled-reason={behaviorDisabledReason || undefined}
          data-current-rel={props.rel || ''}
          className={cn(
            'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
            'focus:outline-none focus:ring-2 focus:ring-ring'
          )}
          placeholder={target === '_blank' ? 'noopener noreferrer' : 'nofollow sponsored'}
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Accessibility label
        </label>
        <input
          type="text"
          value={props.ariaLabel || ''}
          disabled={disabled}
          onChange={(e) => onChange({ ariaLabel: e.target.value })}
          data-testid={`editor-${prefix}-aria-label`}
          aria-describedby={behaviorActionStatusId}
          data-action-state={behaviorActionState}
          data-action-status={behaviorControlActionStatus(`${isButton ? 'Button' : 'Link'} accessibility label`, props.ariaLabel || 'empty')}
          data-disabled-reason={behaviorDisabledReason || undefined}
          data-current-aria-label={props.ariaLabel || ''}
          className={cn(
            'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
            'focus:outline-none focus:ring-2 focus:ring-ring'
          )}
          placeholder="Describe the destination or action"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Title tooltip
        </label>
        <input
          type="text"
          value={props.title || ''}
          disabled={disabled}
          onChange={(e) => onChange({ title: e.target.value })}
          data-testid={`editor-${prefix}-title`}
          aria-describedby={behaviorActionStatusId}
          data-action-state={behaviorActionState}
          data-action-status={behaviorControlActionStatus(`${isButton ? 'Button' : 'Link'} title tooltip`, props.title || 'empty')}
          data-disabled-reason={behaviorDisabledReason || undefined}
          data-current-title={props.title || ''}
          className={cn(
            'w-full px-2 py-1.5 text-sm rounded-md border bg-background',
            'focus:outline-none focus:ring-2 focus:ring-ring'
          )}
          placeholder="Optional hover title"
        />
      </div>
    </div>
  );
}
