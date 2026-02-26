/**
 * Global Mock Store
 * 
 * Centralized store for all application data.
 * Uses localStorage persistence to simulate a real database.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateId } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

export interface Site {
    id: string;
    name: string;
    slug: string;
    description: string;
    customDomain: string | null;
    status: 'published' | 'draft' | 'archived';
    publicSiteId?: string;
    pageCount: number;
    lastUpdated: string;
}

export interface Page {
    id: string;
    siteId: string;
    title: string;
    slug: string;
    status: 'published' | 'draft';
    content?: string;
    meta?: Record<string, any>;
    lastUpdated: string;
}

export interface BlogPost {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    status: 'published' | 'draft';
    author: string;
    publishedAt: string;
}

export interface User {
    id: string;
    fullName: string;
    email: string;
    role: 'admin' | 'editor' | 'viewer';
    status: 'active' | 'inactive';
    lastActive: string;
}

type MediaScope = 'global' | 'page' | 'post';

type MediaVisibility = 'public' | 'private';

export interface MediaAsset {
  id: string;
  name: string;
  type: 'image' | 'video' | 'file';
  size: string;
  url: string;
  scope?: MediaScope;
  scopeTargetId?: string | null;
  visibility?: MediaVisibility;
  uploadedBy?: string | null;
  targetPageIds?: string[];
  targetPostIds?: string[];
}

export type DeliveryMode = 'managed-hosting' | 'custom-frontend';

export interface AppSettings {
  deliveryMode: DeliveryMode;
  apiKeys: {
    publicApiKey: string;
    adminApiKey: string;
  };
}

interface AppState {
    sites: Site[];
    pages: Page[];
    posts: BlogPost[];
    users: User[];
    media: MediaAsset[];
    settings: AppSettings;

    // Actions
    addSite: (site: Omit<Site, 'id' | 'pageCount' | 'lastUpdated'>) => void;
    updateSite: (id: string, updates: Partial<Site>) => void;
    deleteSite: (id: string) => void;

    addPage: (page: Omit<Page, 'id' | 'lastUpdated'>) => void;
    deletePage: (id: string) => void;

    addPost: (post: Omit<BlogPost, 'id' | 'publishedAt'>) => void;
    updatePost: (id: string, updates: Partial<BlogPost>) => void;
    deletePost: (id: string) => void;

    updatePage: (id: string, updates: Partial<Page>) => void;

    addUser: (user: Omit<User, 'id' | 'lastActive' | 'status'>) => void;
    updateUser: (id: string, updates: Partial<User>) => void;
    deleteUser: (id: string) => void;

    addMedia: (media: Omit<MediaAsset, 'id'>) => void;
    deleteMedia: (id: string) => void;

    setDeliveryMode: (mode: DeliveryMode) => void;
    updateSettings: (updates: Partial<AppSettings>) => void;
    regenerateApiKeys: () => void;
}

// ============================================
// INITIAL MOCK DATA
// ============================================

const INITIAL_SITES: Site[] = [
    {
        id: '1',
        name: 'My Portfolio',
        slug: 'portfolio',
        description: 'Personal design portfolio showcasing my latest work.',
        customDomain: 'portfolio.design',
        publicSiteId: 'site-demo',
        status: 'published',
        pageCount: 5,
        lastUpdated: new Date().toISOString(),
    },
    {
        id: '2',
        name: 'Tech Blog',
        slug: 'tech-blog',
        description: 'Weekly articles about web development.',
        customDomain: null,
        publicSiteId: 'site-cook',
        status: 'draft',
        pageCount: 12,
        lastUpdated: new Date(Date.now() - 86400000).toISOString(),
    },
];

const INITIAL_POSTS: BlogPost[] = [
    {
        id: '1',
        title: 'Getting Started with Backy CMS',
        slug: 'getting-started',
        excerpt: 'Everything you need to know about setting up your first site.',
        content: 'Long content here...',
        status: 'published',
        author: 'Admin User',
        publishedAt: new Date().toISOString(),
    },
    {
        id: '2',
        title: 'Why We Switched to React',
        slug: 'react-switch',
        excerpt: 'A deep dive into our engineering decisions.',
        content: 'Long content here...',
        status: 'draft',
        author: 'Admin User',
        publishedAt: new Date().toISOString(),
    },
];

const INITIAL_USERS: User[] = [
    {
        id: '1',
        fullName: 'Admin User',
        email: 'admin@backy.io',
        role: 'admin',
        status: 'active',
        lastActive: 'Just now',
    },
    {
        id: '2',
        fullName: 'Jane Editor',
        email: 'jane@backy.io',
        role: 'editor',
        status: 'active',
        lastActive: '2 hours ago',
    },
];

const INITIAL_MEDIA: MediaAsset[] = [
  {
    id: '1',
    name: 'hero-image.jpg',
    type: 'image',
    size: '2.4 MB',
    url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809',
    scope: 'global',
    scopeTargetId: null,
    visibility: 'public',
    uploadedBy: 'admin',
    targetPageIds: ['1'],
    targetPostIds: [],
  },
  {
    id: '2',
    name: 'document.pdf',
    type: 'file',
    size: '1.2 MB',
    url: '',
    scope: 'global',
    scopeTargetId: null,
    visibility: 'public',
    uploadedBy: 'admin',
    targetPageIds: [],
    targetPostIds: [],
  },
  {
    id: '3',
    name: 'avatar.png',
    type: 'image',
    size: '450 KB',
    url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde',
    scope: 'global',
    scopeTargetId: null,
    visibility: 'public',
    uploadedBy: 'admin',
    targetPageIds: [],
    targetPostIds: [],
  },
];

const createApiKey = (kind: 'public' | 'admin') =>
  `${kind === 'public' ? 'pk' : 'sk'}_live_${generateId()}`;

const INITIAL_SETTINGS: AppSettings = {
  deliveryMode: 'managed-hosting',
  apiKeys: {
    publicApiKey: createApiKey('public'),
    adminApiKey: createApiKey('admin'),
  },
};

// ============================================
// STORE
// ============================================

export const useStore = create<AppState>()(
    persist(
        (set) => ({
            sites: INITIAL_SITES,
            pages: [],
            posts: INITIAL_POSTS,
            users: INITIAL_USERS,
            media: INITIAL_MEDIA,
            settings: INITIAL_SETTINGS,

            // Site Actions
            addSite: (site) => set((state) => ({
                sites: [{
                    ...site,
                    id: generateId(),
                    pageCount: 0,
                    lastUpdated: new Date().toISOString(),
                }, ...state.sites]
            })),

            updateSite: (id, updates) => set((state) => ({
                sites: state.sites.map(s => s.id === id ? { ...s, ...updates, lastUpdated: new Date().toISOString() } : s)
            })),

            deleteSite: (id) => set((state) => ({
                sites: state.sites.filter(s => s.id !== id)
            })),

            // Page Actions
            addPage: (page) => set((state) => ({
                pages: [{
                    ...page,
                    id: generateId(),
                    lastUpdated: new Date().toISOString(),
                }, ...state.pages]
            })),

            deletePage: (id) => set((state) => ({
                pages: state.pages.filter(p => p.id !== id)
            })),

            updatePage: (id, updates) => set((state) => ({
                pages: state.pages.map(p => p.id === id ? { ...p, ...updates, lastUpdated: new Date().toISOString() } : p)
            })),

            // Post Actions
            addPost: (post) => set((state) => ({
                posts: [{
                    ...post,
                    id: generateId(),
                    publishedAt: new Date().toISOString(),
                }, ...state.posts]
            })),

            updatePost: (id, updates) => set((state) => ({
                posts: state.posts.map(p => p.id === id ? { ...p, ...updates } : p)
            })),

            deletePost: (id) => set((state) => ({
                posts: state.posts.filter(p => p.id !== id)
            })),

            // User Actions
            addUser: (user) => set((state) => ({
                users: [{
                    ...user,
                    id: generateId(),
                    status: 'active',
                    lastActive: 'Never',
                }, ...state.users]
            })),

            updateUser: (id, updates) => set((state) => ({
                users: state.users.map(u => u.id === id ? { ...u, ...updates } : u)
            })),

            deleteUser: (id) => set((state) => ({
                users: state.users.filter(u => u.id !== id)
            })),

            // Media Actions
            addMedia: (media) => set((state) => ({
                media: [
                    {
                        ...media,
                        id: generateId(),
                    },
                    ...state.media,
                ],
            })),

            deleteMedia: (id) => set((state) => ({
                media: state.media.filter((item) => item.id !== id),
            })),

            setDeliveryMode: (mode) =>
              set((state) => ({
                settings: {
                  ...state.settings,
                  deliveryMode: mode,
                },
              })),

            updateSettings: (updates) =>
              set((state) => ({
                settings: {
                  ...state.settings,
                  ...updates,
                  apiKeys: updates.apiKeys
                    ? {
                        ...state.settings.apiKeys,
                        ...updates.apiKeys,
                      }
                    : state.settings.apiKeys,
                },
              })),

            regenerateApiKeys: () =>
              set((state) => ({
                settings: {
                  ...state.settings,
                  apiKeys: {
                    publicApiKey: createApiKey('public'),
                    adminApiKey: createApiKey('admin'),
                  },
                },
              })),
        }),
        {
            name: 'backy-db',
        }
    )
);
