/** Actual media route with a disposable operator identity; never provider certification. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createRootRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { Route as MediaRoute } from '../src/routes/media';
import { useAuthStore } from '../src/stores/authStore';
import { clearUserPermissionsCache } from '../src/lib/adminContentApi';
import { useStore } from '../src/stores/mockStore';

clearUserPermissionsCache();
useAuthStore.setState({ user: { id: 'synthetic-media-owner', email: 'owner@fixture.invalid', fullName: 'Disposable media owner', role: 'owner' }, session: null, isLoading: false });
useStore.setState({ sites: [{ id: 'media-browser-proof', name: 'Disposable media acceptance', slug: 'media-browser-proof', isPublished: true } as any], media: [], pages: [], posts: [] });
const root = createRootRoute({ component: () => <main className="p-6"><aside className="mb-4 border p-2 text-sm">Actual media route and upload/transform HTTP handlers. Disposable memory repository, local bytes and synthetic operator/scanner; no real provider proof. <button className="ml-4 border p-1" onClick={() => fetch('/fixture/mode?mode=hold', { method: 'POST' })}>Hold next upload</button><button className="ml-4 border p-1" onClick={() => fetch('/fixture/mode?mode=busy', { method: 'POST' })}>Hold external writer</button><button className="ml-2 border p-1" onClick={() => fetch('/fixture/mode?mode=ready', { method: 'POST' })}>Release external writer</button><button className="ml-2 border p-1" onClick={() => fetch('/fixture/mode?mode=uncertain', { method: 'POST' })}>Lose storage confirmation</button><button className="ml-2 border p-1" onClick={() => fetch('/fixture/mode?mode=followup', { method: 'POST' })}>Fail transform follow-up</button></aside><Outlet /></main> });
const media = MediaRoute.update({ getParentRoute: () => root, path: '/media' } as any);
const router = createRouter({ routeTree: root.addChildren([media]) });
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
