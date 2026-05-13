import { useMemo, useState, useEffect } from 'react';
import { X, Search, Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContentStatus } from '@/stores/mockStore';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/dateTime';
import { MediaLibraryModal, type MediaContext } from '@/components/editor/MediaLibraryModal';

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
    const [activeTab, setActiveTab] = useState<'general' | 'seo' | 'social'>('general');
    const [validationError, setValidationError] = useState<string | null>(null);
    const [jsonLdText, setJsonLdText] = useState(() => formatJsonLd(initialSettings.meta.jsonLd));
    const [keywordDraft, setKeywordDraft] = useState('');
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [isSocialImagePickerOpen, setIsSocialImagePickerOpen] = useState(false);

    useEffect(() => {
        setSettings(initialSettings);
        setJsonLdText(formatJsonLd(initialSettings.meta.jsonLd));
        setKeywordDraft('');
        setValidationError(null);
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

    if (!isOpen) return null;

    const handleSave = async () => {
        if (isSavingSettings) {
            return;
        }
        if (!canEdit) {
            setValidationError(editDisabledReason);
            return;
        }
        if ((settings.status === 'published' || settings.status === 'scheduled') && !canPublish) {
            setValidationError(publishDisabledReason);
            return;
        }

        if (settings.status === 'scheduled' && !settings.scheduledAt) {
            setValidationError('Choose a publish date before scheduling this page.');
            return;
        }

        const parsedJsonLd = parseJsonLd(jsonLdText);
        if (!parsedJsonLd.ok) {
            setValidationError(parsedJsonLd.message);
            setActiveTab('seo');
            return;
        }

        if (settingsValidation) {
            setValidationError(settingsValidation);
            setActiveTab('general');
            return;
        }

        setIsSavingSettings(true);
        setValidationError(null);

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

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="page-settings-dialog-title"
            data-testid="page-settings-dialog"
        >
            <div className="w-[500px] bg-background border border-border rounded-lg shadow-xl flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 id="page-settings-dialog-title" className="text-lg font-semibold">Page Settings</h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                        aria-label="Close page settings"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex px-4 border-b border-border gap-6">
                    <button
                        onClick={() => setActiveTab('general')}
                        data-testid="page-settings-tab-general"
                        className={cn(
                            'py-3 text-sm font-medium border-b-2 transition-colors',
                            activeTab === 'general'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        General
                    </button>
                    <button
                        onClick={() => setActiveTab('seo')}
                        data-testid="page-settings-tab-seo"
                        className={cn(
                            'py-3 text-sm font-medium border-b-2 transition-colors',
                            activeTab === 'seo'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        SEO
                    </button>
                    <button
                        onClick={() => setActiveTab('social')}
                        data-testid="page-settings-tab-social"
                        className={cn(
                            'py-3 text-sm font-medium border-b-2 transition-colors',
                            activeTab === 'social'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        Social Share
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
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
                                    onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                                    disabled={!canEdit}
                                    title={canEdit ? undefined : editDisabledReason}
                                    className="w-full px-3 py-2 border rounded-md bg-background focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                    placeholder="e.g. valid-title"
                                    data-testid="page-settings-title"
                                />
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
                                        onChange={(e) => setSettings({ ...settings, slug: e.target.value })}
                                        disabled={!canEdit}
                                        title={canEdit ? undefined : editDisabledReason}
                                        className="flex-1 px-3 py-2 border rounded-r-md bg-background focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder="about-us"
                                        data-testid="page-settings-slug"
                                    />
                                </div>
                            </div>
                            {settingsValidation && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                                    {settingsValidation}
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
                                    disabled={!canEdit}
                                    title={canEdit ? undefined : editDisabledReason}
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
                                        className="w-full px-3 py-2 border rounded-md bg-background focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                        data-testid="page-settings-scheduled-at"
                                    />
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
                                        setJsonLdText(e.target.value);
                                    }}
                                    rows={6}
                                    disabled={!canEdit}
                                    title={canEdit ? undefined : editDisabledReason}
                                    className="w-full px-3 py-2 border rounded-md bg-background font-mono text-xs leading-5 focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                                    placeholder='[{"@context":"https://schema.org","@type":"WebPage"}]'
                                    data-testid="page-settings-json-ld"
                                />
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
                        className="px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md"
                        data-testid="page-settings-cancel"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={Boolean(settingsValidation) || isSavingSettings || !canEdit}
                        title={canEdit ? undefined : editDisabledReason}
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
                canView={canViewMedia}
                canCreate={canCreateMedia}
                viewDisabledReason={mediaViewDisabledReason}
                createDisabledReason={mediaCreateDisabledReason}
            />
        </div>
    );
}
