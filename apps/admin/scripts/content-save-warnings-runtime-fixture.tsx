/// <reference types="vite/client" />
/** Mount the production route components; only identity and auxiliary reads are synthetic. */
import { createRoot } from 'react-dom/client';
import { createRootRoute, createRouter, Outlet, RouterProvider, type AnyRoute } from '@tanstack/react-router';
import { Route as PageRoute } from '../src/routes/pages.$pageId.edit';
import { Route as BlogRoute } from '../src/routes/blog.$postId';
import { useStore } from '../src/stores/mockStore';
import { useAuthStore } from '../src/stores/authStore';
import { getPage, getBlogPost } from '../src/lib/adminContentApi';

async function start() {
  const seed = await (await fetch('/fixture/seed')).json();
  useAuthStore.setState({ user: { id: 'synthetic-save-owner', email: 'fixture@example.test', fullName: 'Synthetic save owner', role: 'owner' }, isLoading: false });
  const [page, post] = await Promise.all([getPage(seed.site.id, seed.page.id), getBlogPost(seed.site.id, seed.post.id)]);
  const site = { ...useStore.getState().sites[0], ...seed.site, publicSiteId: seed.site.id };
  useStore.setState({ sites: [site], pages: [page], posts: [post] });
  const rootRoute = createRootRoute({ component: () => <main className="h-screen overflow-auto bg-white p-4"><nav className="mb-3 flex flex-wrap items-center gap-3 border-b pb-3 text-sm"><strong>Production save-warning route proof</strong><a href={`/pages/${seed.page.id}/edit?siteId=${seed.site.id}`}>Open page</a><a href={`/blog/${seed.post.id}?siteId=${seed.site.id}`}>Open blog</a><a href={location.href}>Reopen current saved copy</a><span>Synthetic owner and follow-ups; actual PATCH/GET, route UI and disk persistence.</span></nav><Outlet /></main> });
  const pageRoute = PageRoute.update({ id: '/pages/$pageId/edit', path: '/pages/$pageId/edit', getParentRoute: () => rootRoute } as any);
  const blogRoute = BlogRoute.update({ id: '/blog/$postId', path: '/blog/$postId', getParentRoute: () => rootRoute } as any);
  if (location.pathname === '/') history.replaceState(null, '', `/pages/${seed.page.id}/edit?siteId=${seed.site.id}`);
  // File routes normally inherit the generated app root. This owned fixture
  // deliberately rebases them onto its minimal root while retaining components.
  const router = createRouter({ routeTree: rootRoute.addChildren([pageRoute as unknown as AnyRoute, blogRoute as unknown as AnyRoute]) });
  const root = createRoot(document.getElementById('root')!);
  root.render(<RouterProvider router={router} />);
  import.meta.hot?.dispose(() => root.unmount());
}
void start().catch((error) => { document.getElementById('root')!.textContent = String(error); });
