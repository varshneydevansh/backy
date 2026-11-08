/** Actual Comments/Forms routes; used only by the owned review acceptance service. */
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createRootRoute, createRouter, Link, Outlet, RouterProvider, useNavigate } from '@tanstack/react-router';
import { Route as CommentsRoute } from '../src/routes/comments';
import { Route as FormsRoute } from '../src/routes/forms';
import { useAuthStore } from '../src/stores/authStore';
import { useStore } from '../src/stores/mockStore';
import { clearUserPermissionsCache } from '../src/lib/adminContentApi';
const users = { owner: { id: 'review-owner', email: 'owner@fixture.invalid', fullName: 'Synthetic owner', role: 'owner' }, operator: { id: 'review-operator', email: 'operator@fixture.invalid', fullName: 'Synthetic operator', role: 'admin' } } as const;
const initialRole = sessionStorage.getItem('review-fixture-role') === 'operator' ? 'operator' : 'owner';
useAuthStore.setState({ user: users[initialRole], session: null, isLoading: false });
useStore.setState({ sites: [{ id: 'review-site', name: 'Owned review site', slug: 'review-site', isPublished: true }, { id: 'review-other', name: 'Other isolated site', slug: 'review-other', isPublished: true }] as any, pages: [], posts: [] });
clearUserPermissionsCache();
function FixtureShell() {
  const navigate = useNavigate();
  useEffect(() => {
    const switchSite = (event: KeyboardEvent) => { if (event.altKey && event.shiftKey && event.code === 'KeyB') { event.preventDefault(); void navigate({ to: '/comments', search: { siteId: 'review-other' } } as any); } };
    document.addEventListener('keydown', switchSite); return () => document.removeEventListener('keydown', switchSite);
  }, [navigate]);
  return <main className="p-6"><aside className="mb-4 flex flex-wrap gap-3 border p-3 text-sm">
    <span>Actual routes, shared auth and durable demo journal. Synthetic owner; no provider delivery.</span>
    <Link to="/comments" search={{ siteId: 'review-site' }}>Comments</Link>
    <Link to="/forms" search={{ siteId: 'review-site', formId: 'review-form' }}>Forms</Link>
    <Link to="/comments" search={{ siteId: 'review-other' }}>Other site</Link>
    <button onClick={() => void fetch('/fixture/stale-next', { method: 'POST' })}>Competing review next</button>
    <button onClick={() => void fetch('/fixture/hold-next', { method: 'POST' })}>Hold next review</button>
    <button onClick={() => void fetch('/fixture/release', { method: 'POST' })}>Release held review</button>
    <button onClick={() => void fetch('/fixture/denied-proof', { method: 'POST' })}>Probe nonowner denial</button>
    <button onClick={async () => { const mode = useAuthStore.getState().user?.role === 'owner' ? 'operator' : 'owner'; await fetch('/fixture/login?mode=' + mode, { method: 'POST' }); sessionStorage.setItem('review-fixture-role', mode); clearUserPermissionsCache(); useAuthStore.setState({ user: users[mode] }); }}>Switch owner/operator</button>
  </aside><Outlet /></main>;
}
const root = createRootRoute({ component: FixtureShell });
const comments = CommentsRoute.update({ getParentRoute: () => root, path: '/comments' } as any), forms = FormsRoute.update({ getParentRoute: () => root, path: '/forms' } as any);
await fetch('/fixture/login?mode=' + initialRole, { method: 'POST' });
createRoot(document.getElementById('root')!).render(<RouterProvider router={createRouter({ routeTree: root.addChildren([comments, forms]) })} />);
