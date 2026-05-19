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
  content?: Record<string, unknown>;
}

interface ManagedElementTarget {
  id: string;
  type: string;
  label: string;
}

interface LivePageManagementOverlayProps {
  enabled: boolean;
  siteId?: string;
  pageId?: string;
  adminAppUrl?: string;
}

const STATUS_OPTIONS: ManagedPageStatus[] = ['draft', 'published', 'scheduled', 'archived'];
const INLINE_TEXT_ELEMENT_TYPES = new Set(['text', 'heading', 'paragraph', 'quote', 'button', 'link']);

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
    content: isRecord(page.content) ? { ...page.content } : undefined,
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

const elementLabel = (element: HTMLElement): string => {
  const id = element.dataset.backyElementId || element.dataset.elementId || '';
  const type = element.dataset.backyElementType || element.dataset.elementType || 'element';
  const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
  const textPreview = text.length > 0 ? ` - ${text.slice(0, 32)}${text.length > 32 ? '...' : ''}` : '';
  return `${type}${textPreview || ` - ${id.slice(0, 10)}`}`;
};

const findRenderedElement = (elementId: string): HTMLElement | null => (
  Array.from(document.querySelectorAll<HTMLElement>('[data-backy-element-id], [data-element-id]'))
    .find((element) => (element.dataset.backyElementId || element.dataset.elementId || '') === elementId) || null
);

const slatePlainText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(slatePlainText).join('\n').trim();
  }

  if (!isRecord(value)) {
    return '';
  }

  if (typeof value.text === 'string') {
    return value.text;
  }

  return Array.isArray(value.children) ? value.children.map(slatePlainText).join('') : '';
};

const stripMarkup = (value: string): string => (
  value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim()
);

const elementFromContent = (content: Record<string, unknown> | undefined, elementId: string): Record<string, unknown> | null => {
  const roots = [
    ...(Array.isArray(content?.elements) ? content?.elements || [] : []),
    ...(isRecord(content?.contentDocument) && Array.isArray(content.contentDocument.elements)
      ? content.contentDocument.elements
      : []),
  ];

  const visit = (items: unknown[]): Record<string, unknown> | null => {
    for (const item of items) {
      if (!isRecord(item)) continue;
      if (item.id === elementId) return item;
      if (Array.isArray(item.children)) {
        const found = visit(item.children);
        if (found) return found;
      }
    }

    return null;
  };

  return visit(roots);
};

const inlineTextFromElement = (element: Record<string, unknown> | null): string => {
  if (!element || !INLINE_TEXT_ELEMENT_TYPES.has(String(element.type || ''))) {
    return '';
  }

  const props = isRecord(element.props) ? element.props : {};
  const value = props.content ?? props.label ?? props.text;
  return stripMarkup(slatePlainText(value));
};

const updateElementText = (
  content: Record<string, unknown> | undefined,
  elementId: string,
  nextText: string,
): Record<string, unknown> | null => {
  if (!content) {
    return null;
  }

  const nextContent = JSON.parse(JSON.stringify(content)) as Record<string, unknown>;
  let changed = false;

  const visit = (items: unknown[]) => {
    items.forEach((item) => {
      if (!isRecord(item)) return;
      if (item.id === elementId) {
        item.props = {
          ...(isRecord(item.props) ? item.props : {}),
          content: nextText,
        };
        changed = true;
      }
      if (Array.isArray(item.children)) {
        visit(item.children);
      }
    });
  };

  if (Array.isArray(nextContent.elements)) {
    visit(nextContent.elements);
  }
  if (isRecord(nextContent.contentDocument) && Array.isArray(nextContent.contentDocument.elements)) {
    visit(nextContent.contentDocument.elements);
  }

  return changed ? nextContent : null;
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
  const [elementTargets, setElementTargets] = useState<ManagedElementTarget[]>([]);
  const [selectedElementId, setSelectedElementId] = useState('');
  const [selectedElementRect, setSelectedElementRect] = useState<DOMRect | null>(null);
  const [inlineText, setInlineText] = useState('');
  const [inlineTextSaving, setInlineTextSaving] = useState(false);

  const manageEndpoint = useMemo(() => {
    if (!siteId || !pageId) return '';
    return `/api/sites/${encodeURIComponent(siteId)}/manage/pages/${encodeURIComponent(pageId)}`;
  }, [pageId, siteId]);

  const editorHref = useMemo(() => {
    if (!siteId || !pageId) return '';
    const selectedElementQuery = selectedElementId ? `&elementId=${encodeURIComponent(selectedElementId)}` : '';
    return joinedAdminUrl(
      adminAppUrl,
      `/pages/${encodeURIComponent(pageId)}/edit?siteId=${encodeURIComponent(siteId)}&focus=canvas${selectedElementQuery}`,
    );
  }, [adminAppUrl, pageId, selectedElementId, siteId]);

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

  useEffect(() => {
    if (!enabled || !page) {
      return;
    }

    const collectTargets = () => {
      const seen = new Set<string>();
      const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-backy-element-id], [data-element-id]'))
        .map((element) => {
          const id = element.dataset.backyElementId || element.dataset.elementId || '';
          const type = element.dataset.backyElementType || element.dataset.elementType || 'element';
          const rect = element.getBoundingClientRect();
          if (!id || seen.has(id) || rect.width <= 0 || rect.height <= 0) {
            return null;
          }
          seen.add(id);
          return { id, type, label: elementLabel(element) };
        })
        .filter((target): target is ManagedElementTarget => Boolean(target));

      setElementTargets(targets);
    };

    collectTargets();
    window.setTimeout(collectTargets, 250);
  }, [enabled, page]);

  useEffect(() => {
    if (!selectedElementId) {
      setSelectedElementRect(null);
      setInlineText('');
      return;
    }

    const updateRect = () => {
      const element = findRenderedElement(selectedElementId);
      setSelectedElementRect(element ? element.getBoundingClientRect() : null);
    };

    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [selectedElementId]);

  const selectedContentElement = useMemo(
    () => elementFromContent(page?.content, selectedElementId),
    [page?.content, selectedElementId],
  );
  const selectedElementType = String(selectedContentElement?.type || '');
  const selectedElementSupportsInlineText = INLINE_TEXT_ELEMENT_TYPES.has(selectedElementType);

  useEffect(() => {
    setInlineText(inlineTextFromElement(selectedContentElement));
  }, [selectedContentElement]);

  const focusElement = (elementId: string) => {
    const element = findRenderedElement(elementId);
    setSelectedElementId(elementId);
    if (element) {
      element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      setSelectedElementRect(element.getBoundingClientRect());
    }
  };

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

  const saveInlineText = async () => {
    if (!manageEndpoint || !page || !selectedElementId) return;

    const nextContent = updateElementText(page.content, selectedElementId, inlineText.trim());
    if (!nextContent) {
      setError('Unable to update this element from the live overlay. Open the full editor instead.');
      return;
    }

    setInlineTextSaving(true);
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
          content: nextContent,
          expectedUpdatedAt: page.updatedAt,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(errorMessageFromResponse(payload, 'Unable to save the selected element.'));
      }

      const updatedPage = managedPageFromResponse(payload);
      if (updatedPage) {
        setPage(updatedPage);
      }
      setMessage('Element saved. Reload the page to see delivery changes.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the selected element.');
    } finally {
      setInlineTextSaving(false);
    }
  };

  if (!enabled || !manageEndpoint || (!page && !loading && !error)) {
    return null;
  }

  return (
    <>
      {selectedElementRect ? (
        <div
          aria-hidden="true"
          data-backy-live-element-highlight={selectedElementId}
          style={{
            position: 'fixed',
            left: Math.max(0, selectedElementRect.left - 3),
            top: Math.max(0, selectedElementRect.top - 3),
            width: selectedElementRect.width + 6,
            height: selectedElementRect.height + 6,
            zIndex: 2147482999,
            border: '2px solid #2563eb',
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.08)',
            pointerEvents: 'none',
          }}
        />
      ) : null}
      <section
        aria-label="Backy live page management"
        data-backy-live-management-overlay="page"
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 2147483000,
          width: expanded ? 360 : 250,
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
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Canvas elements</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{elementTargets.length}</span>
                </div>
                <div
                  data-backy-live-element-list="page"
                  style={{
                    display: 'grid',
                    gap: 4,
                    maxHeight: 150,
                    overflow: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    padding: 4,
                  }}
                >
                  {elementTargets.length > 0 ? elementTargets.slice(0, 30).map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => focusElement(target.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        border: '1px solid transparent',
                        borderColor: selectedElementId === target.id ? '#2563eb' : 'transparent',
                        borderRadius: 5,
                        background: selectedElementId === target.id ? '#eff6ff' : '#fff',
                        color: '#0f172a',
                        cursor: 'pointer',
                        padding: '6px 7px',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {target.label}
                      </span>
                      <span style={{ flex: '0 0 auto', fontSize: 11, color: '#64748b' }}>{target.type}</span>
                    </button>
                  )) : (
                    <span style={{ color: '#64748b', fontSize: 12, padding: '5px 6px' }}>No editable rendered elements found.</span>
                  )}
                </div>
              </div>
              {selectedElementId ? (
                <div data-backy-live-inline-editor="page" style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    Inline element text
                  </span>
                  {selectedElementSupportsInlineText ? (
                    <>
                      <textarea
                        value={inlineText}
                        onChange={(event) => setInlineText(event.target.value)}
                        rows={3}
                        style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          font: 'inherit',
                          fontSize: 13,
                          lineHeight: 1.4,
                          padding: '8px 9px',
                          resize: 'vertical',
                        }}
                      />
                      <button
                        type="button"
                        onClick={saveInlineText}
                        disabled={inlineTextSaving || inlineText.trim().length === 0}
                        style={{
                          justifySelf: 'start',
                          border: 0,
                          borderRadius: 6,
                          background: inlineTextSaving || inlineText.trim().length === 0 ? '#94a3b8' : '#2563eb',
                          color: '#fff',
                          cursor: inlineTextSaving || inlineText.trim().length === 0 ? 'not-allowed' : 'pointer',
                          fontWeight: 700,
                          padding: '7px 10px',
                        }}
                      >
                        {inlineTextSaving ? 'Saving element...' : 'Save element text'}
                      </button>
                    </>
                  ) : (
                    <span style={{ color: '#64748b', fontSize: 12 }}>
                      This element type opens in the full editor for changes.
                    </span>
                  )}
                </div>
              ) : null}
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
    </>
  );
}

export default LivePageManagementOverlay;
