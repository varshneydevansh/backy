import { useState, useEffect } from 'react';
import { X, Globe, Search, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageSettings {
    title: string;
    slug: string;
    status: 'draft' | 'published';
    meta: {
        title?: string;
        description?: string;
        keywords?: string[];
        ogImage?: string;
    };
}

interface PageSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: PageSettings;
    onSave: (settings: PageSettings) => void;
}

export function PageSettingsModal({
    isOpen,
    onClose,
    settings: initialSettings,
    onSave,
}: PageSettingsModalProps) {
    const [settings, setSettings] = useState<PageSettings>(initialSettings);
    const [activeTab, setActiveTab] = useState<'general' | 'seo' | 'social'>('general');

    useEffect(() => {
        setSettings(initialSettings);
    }, [initialSettings, isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(settings);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-[500px] bg-background border border-border rounded-lg shadow-xl flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-lg font-semibold">Page Settings</h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex px-4 border-b border-border gap-6">
                    <button
                        onClick={() => setActiveTab('general')}
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
                            <div>
                                <label className="block text-sm font-medium mb-1">Page Title</label>
                                <input
                                    type="text"
                                    value={settings.title}
                                    onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-md bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                                    placeholder="e.g. valid-title"
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
                                        className="flex-1 px-3 py-2 border rounded-r-md bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                                        placeholder="about-us"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Status</label>
                                <select
                                    value={settings.status}
                                    onChange={(e) => setSettings({ ...settings, status: e.target.value as 'draft' | 'published' })}
                                    className="w-full px-3 py-2 border rounded-md bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {activeTab === 'seo' && (
                        <div className="space-y-4">
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
                                    className="w-full px-3 py-2 border rounded-md bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                                    placeholder="Title shown in search results"
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
                                    className="w-full px-3 py-2 border rounded-md bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                                    placeholder="Description shown in search results"
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'social' && (
                        <div className="space-y-4">
                            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:bg-accent/50 transition-colors cursor-pointer">
                                <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                                <p className="text-sm font-medium">Upload Social Share Image</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Recommmended size: 1200x630
                                </p>
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
                                    className="w-full px-3 py-2 border rounded-md bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                                    placeholder="https://..."
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
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
