'use client';

import { useEffect, useMemo, useState } from 'react';

type ManagedPageStatus = 'draft' | 'published' | 'scheduled' | 'archived';

interface ManagedPage {
  id: string;
  title?: string;
  slug?: string;
  status?: ManagedPageStatus;
  isHomepage?: boolean;
  updatedAt?: string;
}

interface LivePageManagementOverlayProps {
  enabled: boolean;
  siteId?: string;
  pageId?: string;
  adminAppUrl?: string;
}

const STATUS_OPTIONS: ManagedPageStatus[] = ['draft', 'published', 'scheduled', 'archived'];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const managedPageFromResponse = (payload: unknown): ManagedPage | null => {
  if (!isRecord(payload) || !isRecord(payload.data) || !isRecord(payload.data.page)) {
    return null;
  }

  const page = payload.data.page;
  const status = page.status;

  return {
    id: typeof page.id === 'string' ? page.id : '',
    title: typeof page.title === 'string' ? page.title : '',
    slug: typeof page.slug === 'string' ? page.slug : '',
    status: STATUS_OPTIONS.includes(status as ManagedPageStatus) ? status as ManagedPageStatus : 'draft',
    isHomepage: page.isHomepage === true,
    updatedAt: typeof page.updatedAt === 'string' ? page.updatedAt : '',
  };
};

const errorMessageFromResponse = (payload: unknown, fallback: string) => {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string') {
    return payload.error.message;
  }

  return fallback;
};

const joinedAdminUrl = (adminAppUrl: string | undefined, path: string) => {
  const base = (adminAppUrl || '').trim().replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
};

export function LivePageManagementOverlay({
  enabled,
  siteId,
  pageId,
  adminAppUrl,
}: LivePageManagementOverlayProps) {
  const [page, setPage] = useState<ManagedPage | null>(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<ManagedPageStatus>('draft');
  const [isHomepage, setIsHomepage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const manageEndpoint = useMemo(() => {
    if (!siteId || !pageId) return '';
    return `/api/sites/${encodeURIComponent(siteId)}/manage/pages/${encodeURIComponent(pageId)}`;
  }, [pageId, siteId]);

  const editorHref = useMemo(() => {
    if (!siteId || !pageId) return '';
    return joinedAdminUrl(
      adminAppUrl,
      `/pages/${encodeURIComponent(pageId)}/edit?siteId=${encodeURIComponent(siteId)}&focus=canvas`,
    );
  }, [adminAppUrl, pageId, siteId]);

  useEffect(() => {
    if (!enabled || !manageEndpoint) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError('');

    fetch(manageEndpoint, {
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new Error(errorMessageFromResponse(payload, 'Unable to load live page management.'));
        }

        return managedPageFromResponse(payload);
      })
      .then((nextPage) => {
        if (!nextPage || controller.signal.aborted) return;
        setPage(nextPage);
        setTitle(nextPage.title || '');
        setStatus(nextPage.status || 'draft');
        setIsHomepage(nextPage.isHomepage === true);
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load live page management.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [enabled, manageEndpoint]);

  const savePage = async () => {
    if (!manageEndpoint || !page) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(manageEndpoint, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          status,
          isHomepage,
          expectedUpdatedAt: page.updatedAt,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessageFromResponse(payload, 'Unable to save the live page changes.'));
      }

      const updatedPage = managedPageFromResponse(payload);
      if (updatedPage) {
        setPage(updatedPage);
        setTitle(updatedPage.title || '');
        setStatus(updatedPage.status || 'draft');
        setIsHomepage(updatedPage.isHomepage === true);
      }
      setMessage('Saved. Reload the page to see delivery changes.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the live page changes.');
    } finally {
      setSaving(false);
    }
  };

  if (!enabled || !manageEndpoint || (!page && !loading && !error)) {
    return null;
  }

  return (
    <section
      aria-label="Backy live page management"
      data-backy-live-management-overlay="page"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 2147483000,
        width: expanded ? 340 : 250,
        maxWidth: 'calc(100vw - 32px)',
        border: '1px solid rgba(15, 23, 42, 0.16)',
        borderRadius: 8,
        background: '#ffffff',
        color: '#0f172a',
        boxShadow: '0 18px 48px rgba(15, 23, 42, 0.22)',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: expanded ? '1px solid #e2e8f0' : 'none' }}>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          style={{
            flex: '1 1 auto',
            border: 0,
            background: 'transparent',
            color: '#0f172a',
            fontWeight: 700,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          Backy live edit
        </button>
        {page?.status ? (
          <span
            style={{
              flex: '0 0 auto',
              borderRadius: 999,
              background: page.status === 'published' ? '#dcfce7' : '#f1f5f9',
              color: page.status === 'published' ? '#166534' : '#334155',
              padding: '3px 8px',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {page.status}
          </span>
        ) : null}
      </div>

      {expanded ? (
        <div style={{ display: 'grid', gap: 10, padding: 12 }}>
          {loading ? <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>Checking admin access...</p> : null}
          {page ? (
            <>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: '#334155' }}>
                Page title
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 9px', font: 'inherit', fontSize: 14 }}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: '#334155' }}>
                Status
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as ManagedPageStatus)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 9px', font: 'inherit', fontSize: 14, background: '#fff' }}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' }}>
                <input
                  type="checkbox"
                  checked={isHomepage}
                  onChange={(event) => setIsHomepage(event.target.checked)}
                />
                Set as homepage
              </label>
              {error ? <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: 12, lineHeight: 1.4 }}>{error}</p> : null}
              {message ? <p style={{ margin: 0, color: '#166534', fontSize: 12, lineHeight: 1.4 }}>{message}</p> : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={savePage}
                  disabled={saving || title.trim().length === 0}
                  style={{
                    border: 0,
                    borderRadius: 6,
                    background: saving || title.trim().length === 0 ? '#94a3b8' : '#0f172a',
                    color: '#fff',
                    cursor: saving || title.trim().length === 0 ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                    padding: '8px 10px',
                  }}
                >
                  {saving ? 'Saving...' : 'Save live'}
                </button>
                <a
                  href={editorHref}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    color: '#0f172a',
                    fontWeight: 700,
                    padding: '7px 10px',
                    textDecoration: 'none',
                  }}
                >
                  Open editor
                </a>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    background: '#fff',
                    color: '#0f172a',
                    cursor: 'pointer',
                    fontWeight: 700,
                    padding: '7px 10px',
                  }}
                >
                  Reload
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default LivePageManagementOverlay;
