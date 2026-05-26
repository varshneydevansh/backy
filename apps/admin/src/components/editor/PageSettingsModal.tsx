import { useMemo, useState, useEffect } from 'react';
import { X, Search, Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContentStatus } from '@/stores/mockStore';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/dateTime';
import { MediaLibraryModal, type MediaContext } from '@/components/editor/MediaLibraryModal';

type PageSettingsTab = 'general' | 'seo' | 'social';

export interface PageSettings {
    title: string;
    slug: string;
    status: ContentStatus;
    scheduledAt?: string | null;
    meta: {
        title?: string;
        description?: string;
        keywords?: string[];
        ogImage?: string;
        jsonLd?: Array<Record<string, unknown>>;
    };
}

interface PageSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: PageSettings;
    onSave: (settings: PageSettings) => Promise<void> | void;
    validateSettings?: (settings: PageSettings) => string | null;
    mediaContext?: MediaContext;
    canEdit?: boolean;
    canPublish?: boolean;
    canViewMedia?: boolean;
    canCreateMedia?: boolean;
    editDisabledReason?: string;
    publishDisabledReason?: string;
    mediaViewDisabledReason?: string;
    mediaCreateDisabledReason?: string;
}

const formatJsonLd = (jsonLd: PageSettings['meta']['jsonLd']): string => (
    Array.isArray(jsonLd) && jsonLd.length > 0 ? JSON.stringify(jsonLd, null, 2) : '[]'
);

const normalizeKeywords = (keywords: string[] | undefined): string[] => (
    Array.from(new Set((keywords || [])
        .flatMap((keyword) => keyword.split(','))
        .map((keyword) => keyword.trim())
        .filter(Boolean)))
        .slice(0, 20)
);

const isPublicationStatus = (status: ContentStatus): boolean => (
    status === 'published' || status === 'scheduled'
);

const PAGE_SETTINGS_DIALOG_TITLE_ID = 'page-settings-dialog-title';
const PAGE_SETTINGS_ACTION_STATUS_ID = 'page-settings-action-status';
const PAGE_SETTINGS_TAB_PANEL_ID = 'page-settings-tab-panel';

const PAGE_SETTINGS_TABS: Array<{ id: PageSettingsTab; label: string; testId: string }> = [
    { id: 'general', label: 'General', testId: 'page-settings-tab-general' },
    { id: 'seo', label: 'SEO', testId: 'page-settings-tab-seo' },
    { id: 'social', label: 'Social Share', testId: 'page-settings-tab-social' },
];

const parseJsonLd = (
    value: string,
): { ok: true; value: Array<Record<string, unknown>> } | { ok: false; message: string } => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value || '[]');
    } catch {
        return { ok: false, message: 'JSON-LD must be valid JSON.' };
    }

    if (!Array.isArray(parsed)) {
        return { ok: false, message: 'JSON-LD must be a JSON array.' };
    }

    for (const [index, entry] of parsed.entries()) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            return { ok: false, message: `JSON-LD entry ${index + 1} must be an object.` };
        }
    }

    return { ok: true, value: parsed as Array<Record<string, unknown>> };
};

export function PageSettingsModal({
    isOpen,
    onClose,
    settings: initialSettings,
    onSave,
    validateSettings,
    mediaContext,
    canEdit = true,
    canPublish = true,
    canViewMedia = true,
    canCreateMedia = true,
    editDisabledReason = 'You do not have permission to edit this page.',
    publishDisabledReason = 'You do not have permission to publish this page.',
    mediaViewDisabledReason,
    mediaCreateDisabledReason,
}: PageSettingsModalProps) {
    const [settings, setSettings] = useState<PageSettings>(initialSettings);
    const [activeTab, setActiveTab] = useState<PageSettingsTab>('general');
    const [validationError, setValidationError] = useState<string | null>(null);
    const [settingsSubmitted, setSettingsSubmitted] = useState(false);
    const [jsonLdInlineError, setJsonLdInlineError] = useState<string | null>(null);
    const [jsonLdText, setJsonLdText] = useState(() => formatJsonLd(initialSettings.meta.jsonLd));
    const [keywordDraft, setKeywordDraft] = useState('');
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [isSocialImagePickerOpen, setIsSocialImagePickerOpen] = useState(false);

    useEffect(() => {
        setSettings(initialSettings);
        setJsonLdText(formatJsonLd(initialSettings.meta.jsonLd));
        setKeywordDraft('');
        setValidationError(null);
        setSettingsSubmitted(false);
        setJsonLdInlineError(null);
        setIsSavingSettings(false);
    }, [initialSettings, isOpen]);

    const keywords = useMemo(
        () => normalizeKeywords(settings.meta.keywords),
        [settings.meta.keywords],
    );
    const settingsValidation = useMemo(
        () => validateSettings?.(settings) || null,
        [settings, validateSettings],
    );
    const jsonLdValidation = useMemo(() => parseJsonLd(jsonLdText), [jsonLdText]);
    const showSettingsValidation = Boolean(settingsSubmitted && settingsValidation);
    const titleInlineError = showSettingsValidation && settingsValidation && /title/i.test(settingsValidation)
        ? settingsValidation
        : null;
    const slugInlineError = showSettingsValidation && settingsValidation && /(slug|url|route|path|\/)/i.test(settingsValidation)
        ? settingsValidation
        : null;
    const generalInlineError = showSettingsValidation && !titleInlineError && !slugInlineError
        ? settingsValidation
        : null;
    const scheduledAtInlineError = settingsSubmitted && settings.status === 'scheduled' && !settings.scheduledAt
        ? 'Choose a publish date before scheduling this page.'
        : null;
    const publicationStateChanging = settings.status !== initialSettings.status
        && (isPublicationStatus(settings.status) || isPublicationStatus(initialSettings.status));
    const activeTabLabel = PAGE_SETTINGS_TABS.find((tab) => tab.id === activeTab)?.label || 'General';
    const pageSettingsSaveDisabledReason = isSavingSettings
        ? 'Page settings save is running.'
        : !canEdit ? editDisabledReason : undefined;
    const pageSettingsSaveBlocker = pageSettingsSaveDisabledReason
        || (publicationStateChanging && !canPublish ? publishDisabledReason : undefined)
        || (settings.status === 'scheduled' && !settings.scheduledAt ? 'Choose a publish date before saving scheduled page settings.' : undefined)
        || (settingsValidation ? `Resolve page settings validation before saving: ${settingsValidation}` : undefined)
        || (!jsonLdValidation.ok ? `Resolve JSON-LD validation before saving: ${jsonLdValidation.message}` : undefined);
    const pageSettingsSaveActionState = isSavingSettings
        ? 'busy'
        : pageSettingsSaveBlocker ? 'blocked' : 'ready';
    const pageSettingsSaveActionStatus = isSavingSettings
        ? 'Saving page settings.'
        : pageSettingsSaveBlocker || 'Save page settings and update frontend metadata.';
    const pageSettingsDialogActionStatus = `${activeTabLabel} page settings active. ${pageSettingsSaveActionStatus}`;
    const pageSettingsDismissActionStatus = 'Close page settings without saving changes.';
    const pageSettingsSelectSocialImageActionState = !canEdit || !canViewMedia ? 'blocked' : 'ready';
    const pageSettingsSelectSocialImageActionStatus = !canEdit
        ? editDisabledReason
        : !canViewMedia ? (mediaViewDisabledReason || 'You do not have permission to view media assets.')
            : 'Select a social share image from Media.';
    const pageSettingsRemoveSocialImageActionState = !canEdit ? 'blocked' : settings.meta.ogImage ? 'ready' : 'blocked';
    const pageSettingsRemoveSocialImageActionStatus = !canEdit
        ? editDisabledReason
        : settings.meta.ogImage ? 'Remove the current social share image.' : 'No social share image is selected.';

    if (!isOpen) return null;

    const handleSave = async () => {
        setSettingsSubmitted(true);
        if (isSavingSettings) {
            return;
        }
        if (!canEdit) {
            setValidationError(editDisabledReason);
            return;
        }
        if (publicationStateChanging && !canPublish) {
            setValidationError(publishDisabledReason);
            return;
        }

        if (settings.status === 'scheduled' && !settings.scheduledAt) {
            setValidationError('Choose a publish date before scheduling this page.');
            setActiveTab('general');
            return;
        }

        const parsedJsonLd = jsonLdValidation;
        if (!parsedJsonLd.ok) {
            setValidationError(parsedJsonLd.message);
            setJsonLdInlineError(parsedJsonLd.message);
            setActiveTab('seo');
            return;
        }

        if (settingsValidation) {
            setValidationError(null);
            setActiveTab('general');
            return;
        }

        setIsSavingSettings(true);
        setValidationError(null);
        setJsonLdInlineError(null);

        try {
            const finalKeywords = normalizeKeywords([...keywords, keywordDraft]);
            await Promise.resolve(onSave({
                ...settings,
                meta: {
                    ...settings.meta,
                    keywords: finalKeywords,
                    jsonLd: parsedJsonLd.value,
                },
            }));
            setSettingsSubmitted(false);
            onClose();
        } catch (error) {
            setValidationError(error instanceof Error ? error.message : 'Unable to save page settings.');
        } finally {
            setIsSavingSettings(false);
        }
    };

    const updateKeywords = (nextKeywords: string[]) => {
        if (!canEdit) return;
        setSettings({
            ...settings,
            meta: {
                ...settings.meta,
                keywords: normalizeKeywords(nextKeywords),
            },
        });
    };

    const addKeywordDraft = () => {
        if (!canEdit) return;
        const nextKeywords = normalizeKeywords([...keywords, keywordDraft]);
        if (nextKeywords.length === keywords.length && !keywordDraft.trim()) {
            return;
        }

        updateKeywords(nextKeywords);
        setKeywordDraft('');
    };

    const removeKeyword = (keyword: string) => {
        if (!canEdit) return;
        updateKeywords(keywords.filter((item) => item !== keyword));
    };

    const pageSettingsTabActionProps = (tab: PageSettingsTab, label: string) => {
        const selected = activeTab === tab;

        return {
            role: 'tab',
            id: `page-settings-tab-${tab}`,
            'aria-selected': selected,
            'aria-controls': PAGE_SETTINGS_TAB_PANEL_ID,
            'aria-describedby': PAGE_SETTINGS_ACTION_STATUS_ID,
            'data-action-state': selected ? 'selected' : 'ready',
            'data-action-status': selected ? `${label} page settings tab selected.` : `Open ${label} page settings tab.`,
        };
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby={PAGE_SETTINGS_DIALOG_TITLE_ID}
            aria-describedby={PAGE_SETTINGS_ACTION_STATUS_ID}
            tabIndex={-1}
            data-testid="page-settings-dialog"
            data-active-tab={activeTab}
            data-action-state={pageSettingsSaveActionState}
            data-action-status={pageSettingsDialogActionStatus}
        >
            <div className="w-[500px] bg-background border border-border rounded-lg shadow-xl flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 id={PAGE_SETTINGS_DIALOG_TITLE_ID} className="text-lg font-semibold">Page Settings</h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                        aria-label="Close page settings"
                        aria-describedby={PAGE_SETTINGS_ACTION_STATUS_ID}
                        data-testid="page-settings-close"
                        data-action-state="ready"
                        data-action-status={pageSettingsDismissActionStatus}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <span
                    id={PAGE_SETTINGS_ACTION_STATUS_ID}
                    className="sr-only"
                    data-testid="page-settings-action-status"
                    aria-live="polite"
                >
                    {pageSettingsDialogActionStatus}
                </span>

                {/* Tabs */}
                <div className="flex px-4 border-b border-border gap-6" role="tablist" aria-label="Page settings sections">
                    {PAGE_SETTINGS_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            data-testid={tab.testId}
                            {...pageSettingsTabActionProps(tab.id, tab.label)}
                            className={cn(
                                'py-3 text-sm font-medium border-b-2 transition-colors',
                                activeTab === tab.id
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div
                    id={PAGE_SETTINGS_TAB_PANEL_ID}
                    role="tabpanel"
                    aria-labelledby={`page-settings-tab-${activeTab}`}
                    data-testid="page-settings-tab-panel"
                    className="p-6 overflow-y-auto flex-1"
                >
                    {activeTab === 'general' && (
                        <div className="space-y-4">
                            {validationError && (
                                <div
                                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                                    data-testid="page-settings-validation-error"
                                >
                                    {validationError}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium mb-1">Page Title</label>
                                <input
                                    type="text"
                                    value={settings.title}
                                    onChange={(e) => {
                                        setValidationError(null);
                                        setSettings({ ...settings, title: e.target.value });
                                    }}
                                    disabled={!canEdit}
                                    title={canEdit ? undefined : editDisabledReason}
                                    aria-invalid={Boolean(titleInlineError)}
                                    aria-describedby={titleInlineError ? 'page-settings-title-error' : undefined}
                                    className="w-full px-3 py-2 border rounded-md bg-background focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                    placeholder="e.g. valid-title"
                                    data-testid="page-settings-title"
                                />
                                {titleInlineError && (
                                    <p
                                        id="page-settings-title-error"
                                        className="mt-1 text-xs text-amber-700"
                                        data-testid="page-settings-title-error"
                                    >
                                        {titleInlineError}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">URL Slug</label>
                                <div className="flex items-center">
                                    <span className="bg-muted px-3 py-2 border border-r-0 rounded-l-md text-muted-foreground text-sm">
                                        /
                                    </span>
                                    <input
                                        type="text"
                                        value={settings.slug}
                                        onChange={(e) => {
                                            setValidationError(null);
                                            setSettings({ ...settings, slug: e.target.value });
                                        }}
                                        disabled={!canEdit}
                                        title={canEdit ? undefined : editDisabledReason}
                                        aria-invalid={Boolean(slugInlineError)}
                                        aria-describedby={slugInlineError ? 'page-settings-slug-error' : undefined}
                                        className="flex-1 px-3 py-2 border rounded-r-md bg-background focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder="about-us"
                                        data-testid="page-settings-slug"
                                    />
                                </div>
                                {slugInlineError && (
                                    <p
                                        id="page-settings-slug-error"
                                        className="mt-1 text-xs text-amber-700"
                                        data-testid="page-settings-slug-error"
                                    >
                                        {slugInlineError}
                                    </p>
                                )}
                            </div>
                            {generalInlineError && (
                                <div
                                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
                                    data-testid="page-settings-general-error"
                                    role="alert"
                                >
                                    {generalInlineError}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium mb-1">Status</label>
                                <select
                                    value={settings.status}
                                    onChange={(e) => {
                                        const status = e.target.value as ContentStatus;
                                        setValidationError(null);
                                        setSettings({
                                            ...settings,
                                            status,
                                            scheduledAt: status === 'scheduled' ? settings.scheduledAt || null : null,
                                        });
                                    }}
                                    disabled={!canEdit || (!canPublish && isPublicationStatus(initialSettings.status))}
                                    title={!canEdit ? editDisabledReason : !canPublish && isPublicationStatus(initialSettings.status) ? publishDisabledReason : undefined}
                                    className="w-full px-3 py-2 border rounded-md bg-background focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                    data-testid="page-settings-status"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published" disabled={!canPublish}>Published</option>
                                    <option value="scheduled" disabled={!canPublish}>Scheduled</option>
                                    <option value="archived">Archived</option>
                                </select>
                            </div>

                            {settings.status === 'scheduled' && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">Publish Date</label>
                                    <input
                                        type="datetime-local"
                                        value={toDateTimeLocalValue(settings.scheduledAt)}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            scheduledAt: fromDateTimeLocalValue(e.target.value),
                                        })}
                                        onFocus={() => setValidationError(null)}
                                        disabled={!canEdit || !canPublish}
                                        title={!canEdit ? editDisabledReason : !canPublish ? publishDisabledReason : undefined}
                                        aria-invalid={Boolean(scheduledAtInlineError)}
                                        aria-describedby={scheduledAtInlineError ? 'page-settings-scheduled-at-error' : undefined}
                                        className="w-full px-3 py-2 border rounded-md bg-background focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                        data-testid="page-settings-scheduled-at"
                                    />
                                    {scheduledAtInlineError && (
                                        <p
                                            id="page-settings-scheduled-at-error"
                                            className="mt-1 text-xs text-amber-700"
                                            data-testid="page-settings-scheduled-at-error"
                                        >
                                            {scheduledAtInlineError}
                                        </p>
                                    )}
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Scheduled pages go live automatically after this time.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'seo' && (
                        <div className="space-y-4">
                            {validationError && (
                                <div
                                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                                    data-testid="page-settings-validation-error"
                                >
                                    {validationError}
                                </div>
                            )}
                            <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg border border-border/50 mb-4">
                                <Search className="w-8 h-8 text-blue-500 mt-1" />
                                <div className="space-y-1">
                                    <div className="text-blue-700 text-lg hover:underline cursor-pointer">
                                        {settings.meta.title || settings.title || 'Page Title'}
                                    </div>
                                    <div className="text-green-700 text-sm">
                                        website.com/{settings.slug}
                                    </div>
                                    <div className="text-sm text-foreground/80">
                                        {settings.meta.description || 'Page description will appear here...'}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Meta Title</label>
                                <input
                                    type="text"
                                    value={settings.meta.title || ''}
                                    onChange={(e) =>
                                        setSettings({
                                            ...settings,
                                            meta: { ...settings.meta, title: e.target.value },
                                        })
                                    }
                                    disabled={!canEdit}
                                    title={canEdit ? undefined : editDisabledReason}
                                    className="w-full px-3 py-2 border rounded-md bg-background focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                    placeholder="Title shown in search results"
                                    data-testid="page-settings-meta-title"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Meta Description</label>
                                <textarea
                                    value={settings.meta.description || ''}
                                    onChange={(e) =>
                                        setSettings({
                                            ...settings,
                                            meta: { ...settings.meta, description: e.target.value },
                                        })
                                    }
                                    rows={3}
                                    disabled={!canEdit}
                                    title={canEdit ? undefined : editDisabledReason}
                                    className="w-full px-3 py-2 border rounded-md bg-background focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                    placeholder="Description shown in search results"
                                    data-testid="page-settings-meta-description"
                                />
                            </div>

                            <div>
                                <div className="mb-1 flex items-center justify-between gap-3">
                                    <label className="block text-sm font-medium">SEO Keywords</label>
                                    <span className="text-xs text-muted-foreground">{keywords.length}/20</span>
                                </div>
                                <div className="rounded-md border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-primary">
                                    <div className="flex flex-wrap gap-1.5">
                                        {keywords.map((keyword) => (
                                            <span
                                                key={keyword}
                                                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground"
                                            >
                                                {keyword}
                                                <button
                                                    type="button"
                                                    onClick={() => removeKeyword(keyword)}
                                                    disabled={!canEdit}
                                                    className="rounded text-muted-foreground transition hover:text-foreground"
                                                    aria-label={`Remove ${keyword} keyword`}
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                        <input
                                            type="text"
                                            value={keywordDraft}
                                            onChange={(event) => setKeywordDraft(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ',') {
                                                    event.preventDefault();
                                                    addKeywordDraft();
                                                }
                                            }}
                                            onBlur={addKeywordDraft}
                                            disabled={!canEdit}
                                            title={canEdit ? undefined : editDisabledReason}
                                            className="min-w-[150px] flex-1 bg-transparent px-1 py-1 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                            placeholder={keywords.length ? 'Add keyword...' : 'cms, website builder, portfolio'}
                                            data-testid="page-settings-keywords"
                                        />
                                    </div>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Press Enter or comma to add keywords used by frontend metadata and SEO exports.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">JSON-LD</label>
                                <textarea
                                    value={jsonLdText}
                                    onChange={(e) => {
                                        setValidationError(null);
                                        setJsonLdInlineError(null);
                                        setJsonLdText(e.target.value);
                                    }}
                                    rows={6}
                                    disabled={!canEdit}
                                    title={canEdit ? undefined : editDisabledReason}
                                    aria-invalid={Boolean(jsonLdInlineError)}
                                    aria-describedby={jsonLdInlineError ? 'page-settings-json-ld-error' : undefined}
                                    className="w-full px-3 py-2 border rounded-md bg-background font-mono text-xs leading-5 focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                    placeholder='[{"@context":"https://schema.org","@type":"WebPage"}]'
                                    data-testid="page-settings-json-ld"
                                />
                                {jsonLdInlineError && (
                                    <p
                                        id="page-settings-json-ld-error"
                                        className="mt-1 text-xs text-amber-700"
                                        data-testid="page-settings-json-ld-error"
                                    >
                                        {jsonLdInlineError}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'social' && (
                        <div className="space-y-4">
                            <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
                                <div className="aspect-[1200/630] bg-background">
                                    {settings.meta.ogImage ? (
                                        <img
                                            src={settings.meta.ogImage}
                                            alt="Social share preview"
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                                            <ImageIcon className="mb-3 h-9 w-9 text-muted-foreground" />
                                            <p className="text-sm font-medium">No social image selected</p>
                                            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                                                Choose an image from Media or upload a new public asset for link previews.
                                            </p>
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background px-3 py-3">
                                    <div className="text-xs text-muted-foreground">
                                        Recommended size: 1200x630
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {settings.meta.ogImage && (
                                            <button
                                                type="button"
                                                onClick={() => setSettings({
                                                    ...settings,
                                                    meta: { ...settings.meta, ogImage: '' },
                                                })}
                                                disabled={!canEdit}
                                                title={canEdit ? undefined : editDisabledReason}
                                                aria-describedby={PAGE_SETTINGS_ACTION_STATUS_ID}
                                                data-testid="page-settings-remove-social-image"
                                                data-action-state={pageSettingsRemoveSocialImageActionState}
                                                data-action-status={pageSettingsRemoveSocialImageActionStatus}
                                                data-disabled-reason={!canEdit ? editDisabledReason : undefined}
                                                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                                Remove
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setIsSocialImagePickerOpen(true)}
                                            disabled={!canEdit || !canViewMedia}
                                            title={!canEdit ? editDisabledReason : !canViewMedia ? mediaViewDisabledReason : undefined}
                                            aria-describedby={PAGE_SETTINGS_ACTION_STATUS_ID}
                                            data-testid="page-settings-select-social-image"
                                            data-action-state={pageSettingsSelectSocialImageActionState}
                                            data-action-status={pageSettingsSelectSocialImageActionStatus}
                                            data-disabled-reason={!canEdit ? editDisabledReason : !canViewMedia ? mediaViewDisabledReason : undefined}
                                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            <Upload className="h-3.5 w-3.5" />
                                            Select image
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Image URL</label>
                                <input
                                    type="text"
                                    value={settings.meta.ogImage || ''}
                                    onChange={(e) =>
                                        setSettings({
                                            ...settings,
                                            meta: { ...settings.meta, ogImage: e.target.value },
                                        })
                                    }
                                    disabled={!canEdit}
                                    title={canEdit ? undefined : editDisabledReason}
                                    className="w-full px-3 py-2 border rounded-md bg-background focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                    placeholder="https://..."
                                    data-testid="page-settings-og-image"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 p-4 border-t border-border bg-muted/20">
                    <button
                        onClick={onClose}
                        aria-describedby={PAGE_SETTINGS_ACTION_STATUS_ID}
                        data-action-state="ready"
                        data-action-status={pageSettingsDismissActionStatus}
                        className="px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md"
                        data-testid="page-settings-cancel"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSavingSettings || !canEdit}
                        title={canEdit ? undefined : editDisabledReason}
                        aria-describedby={PAGE_SETTINGS_ACTION_STATUS_ID}
                        data-action-state={pageSettingsSaveActionState}
                        data-action-status={pageSettingsSaveActionStatus}
                        data-disabled-reason={pageSettingsSaveDisabledReason}
                        className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md disabled:cursor-not-allowed disabled:opacity-50"
                        data-testid="page-settings-save"
                    >
                        {isSavingSettings ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
            <MediaLibraryModal
                isOpen={isSocialImagePickerOpen}
                onClose={() => setIsSocialImagePickerOpen(false)}
                onSelect={(asset) => {
                    setSettings({
                        ...settings,
                        meta: { ...settings.meta, ogImage: asset.url },
                    });
                }}
                allowedTypes="image"
                initialUploadFilter="image"
                mediaContext={mediaContext}
                allowScopeSwitcher={Boolean(mediaContext?.scope)}
                returnFocusTargetId="page-settings-select-social-image"
                canView={canViewMedia}
                canCreate={canCreateMedia}
                viewDisabledReason={mediaViewDisabledReason}
                createDisabledReason={mediaCreateDisabledReason}
            />
        </div>
    );
}
