'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isBackyDataFigureKey, type BackyDataFigureConfig } from '@backy-cms/core';
import { BackyDataFigure } from './BackyDataFigure';
import { sanitizePublicInteractiveComponentMetadata } from '../lib/publicInteractiveComponentMetadata';

export interface InteractiveFallback { title?: string; text?: string; html?: string; imageUrl?: string; alt?: string; ariaLabel?: string }
export interface InteractiveRenderableElement {
  id: string; type: string; props: Record<string, unknown>; componentKey?: string; version?: string;
  controls?: Array<Record<string, unknown>>; propsSchema?: Record<string, unknown>;
  fallback?: string | InteractiveFallback; renderCapabilities?: Record<string, unknown>;
  dataBindings?: Array<Record<string, unknown>>; styles?: React.CSSProperties;
}
export interface InteractiveComponentElementProps { element: InteractiveRenderableElement; siteId?: string; pageId?: string; postId?: string; apiBaseUrl?: string }
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const getNameClass = (value: unknown): string => typeof value === 'string' ? value : '';
const sanitizeText = (value: unknown): string => getNameClass(value).trim();
const normalizeIframeLoading = (value: unknown): 'lazy' | 'eager' => value === 'eager' ? 'eager' : 'lazy';

const sanitizeHtmlMarkup = (value: unknown): string => {
  const source = sanitizeText(value);
  if (!source) return '';

  return source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<(iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:script|style|iframe|object|embed|link|meta|base)\b[^>]*>/gi, '')
    .replace(/(?:\s|\/)+on[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(
      /\s+(href|src|xlink:href|formaction|action)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
      (match, attribute: string, rawValue: string) => {
        const valueWithoutQuotes = rawValue.replace(/^['"]|['"]$/g, '');
        const decoded = valueWithoutQuotes.replace(/&#(x[0-9a-f]+|\d+);?/gi, (_match, number: string) => {
          const code = number.toLowerCase().startsWith('x') ? Number.parseInt(number.slice(1), 16) : Number(number);
          return code <= 0x10ffff ? String.fromCodePoint(code) : '';
        }).replace(/&colon;?/gi, ':').replace(/&(?:tab|newline);?/gi, '');
        const normalizedValue = decoded.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
        const isDangerousUrl =
          normalizedValue.startsWith('javascript:') ||
          normalizedValue.startsWith('vbscript:') ||
          normalizedValue.startsWith('data:text/html') ||
          normalizedValue.startsWith('data:image/svg+xml');

        return isDangerousUrl ? ` ${attribute}="#"` : match;
      },
    )
    .replace(
      /\s+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
      (match, rawValue: string) => {
        const normalizedValue = rawValue.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
        return normalizedValue.includes('javascript:')
          || normalizedValue.includes('expression(')
          || normalizedValue.includes('data:text/html')
          ? ''
          : match;
      },
    )
    .replace(/<\/?([a-z][\w:-]*)\b[^>]*>/gi, (tag, name: string) => /^(?:p|span|div|strong|em|b|i|u|s|br|ul|ol|li|a|table|thead|tbody|tr|th|td|caption|figure|figcaption|img|code|pre|h[1-6]|blockquote|details|summary)$/.test(name.toLowerCase()) ? tag : '');
};

const fallbackImageUrl = (value: unknown): string => {
  const url = sanitizeText(value);
  if (!url || /[\u0000-\u0020\u007f\\]/.test(url) || url.startsWith('//')) return '';
  if (/^\/(?!\/)/.test(url)) return url;
  try { return ['https:', 'http:'].includes(new URL(url).protocol) ? url : ''; } catch { return ''; }
};

const INTERACTIVE_IFRAME_SANDBOX_DEFAULT = 'allow-scripts allow-forms';
const INTERACTIVE_IFRAME_SANDBOX_TOKENS = new Set([
  'allow-downloads',
  'allow-forms',
  'allow-pointer-lock',
  'allow-presentation',
  'allow-scripts',
]);
const INTERACTIVE_IFRAME_PERMISSION_TOKENS = new Set([
  'accelerometer',
  'ambient-light-sensor',
  'autoplay',
  'clipboard-read',
  'clipboard-write',
  'display-capture',
  'encrypted-media',
  'fullscreen',
  'geolocation',
  'gyroscope',
  'magnetometer',
  'midi',
  'payment',
  'picture-in-picture',
  'screen-wake-lock',
  'serial',
  'usb',
  'web-share',
  'xr-spatial-tracking',
]);

const parseTokenList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseTokenList(item));
  }

  return sanitizeText(value)
    .split(/[\s,;]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
};

const normalizeInteractiveIframeSandbox = (value: unknown): string => {
  const tokens = parseTokenList(value)
    .filter((token) => INTERACTIVE_IFRAME_SANDBOX_TOKENS.has(token));

  if (tokens.length === 0) {
    return INTERACTIVE_IFRAME_SANDBOX_DEFAULT;
  }

  return Array.from(new Set(tokens)).join(' ');
};

const interactiveIframeUsesOpaqueOrigin = (sandbox: string): boolean => (
  !sandbox.split(/\s+/).includes('allow-same-origin')
);

const normalizeInteractiveIframeAllow = (value: unknown): string | undefined => {
  const tokens = parseTokenList(value)
    .filter((token) => INTERACTIVE_IFRAME_PERMISSION_TOKENS.has(token));

  return tokens.length > 0
    ? Array.from(new Set(tokens)).join('; ')
    : undefined;
};

const normalizeInteractiveSandboxUrl = (value: unknown): string => {
  const raw = sanitizeText(value);
  if (!raw) {
    return '';
  }

  if (/^(javascript|data|blob|file|vbscript):/i.test(raw)) {
    return '';
  }

  if (raw.startsWith('/')) {
    return raw.startsWith('//') ? '' : raw;
  }

  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const parsed = new URL(raw, window.location.origin);
    return parsed.origin === window.location.origin && (parsed.protocol === 'https:' || parsed.protocol === 'http:')
      ? parsed.href
      : '';
  } catch {
    return '';
  }
};

const clampInteractiveNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number.parseFloat(value)
      : fallback;

  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? Math.round(parsed) : fallback));
};

const interactiveControlValue = (
  controls: Array<Record<string, unknown>> | undefined,
  key: string,
): unknown => (
  controls?.find((control) => getNameClass(control.key) === key)?.value
    ?? controls?.find((control) => getNameClass(control.key) === key)?.defaultValue
);

function CommunicationRoundsFigure({
  element,
  fallback,
  componentKey,
  version,
}: {
  element: InteractiveRenderableElement;
  fallback: InteractiveFallback;
  componentKey: string;
  version: string;
}) {
  const { props, styles } = element;
  const controls = Array.isArray(element.controls)
    ? element.controls
    : Array.isArray(props.controls)
      ? props.controls as Array<Record<string, unknown>>
      : undefined;
  const roundCount = clampInteractiveNumber(
    props.rounds ?? interactiveControlValue(controls, 'rounds'),
    4,
    1,
    12,
  );
  const speed = getNameClass(props.speed ?? interactiveControlValue(controls, 'speed')) || 'normal';
  const intervalMs = speed === 'fast' ? 1100 : speed === 'slow' ? 2600 : 1700;
  const [activeRound, setActiveRound] = useState(1);

  useEffect(() => {
    setActiveRound((current) => Math.min(current, roundCount));
  }, [roundCount]);

  useEffect(() => {
    if (speed === 'paused') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setActiveRound((current) => (current >= roundCount ? 1 : current + 1));
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [intervalMs, roundCount, speed]);

  const title = getNameClass(fallback.title) || getNameClass(props.title) || 'Self-correction at work';
  const text = getNameClass(fallback.text) || getNameClass(props.fallbackText) || 'Outputs improve as feedback is exchanged across communication rounds.';
  const rounds = Array.from({ length: roundCount }, (_, index) => {
    const round = index + 1;
    const progress = round / roundCount;
    return {
      round,
      label: `Round ${round}`,
      quality: Math.round(42 + progress * 52),
      active: round === activeRound,
      completed: round <= activeRound,
    };
  });

  return (
    <figure
      style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        gap: 14,
        minHeight: '100%',
        margin: 0,
        padding: 18,
        border: '1px solid #cbd5e1',
        borderRadius: 8,
        background: '#f8fafc',
        color: '#111827',
        overflow: 'hidden',
        ...styles,
      }}
      role="group"
      aria-label={getNameClass(fallback.ariaLabel) || title}
      data-backy-interactive-component={componentKey}
      data-backy-interactive-version={version}
      data-backy-hydration-mode="trusted-component"
    >
      <figcaption style={{ display: 'grid', gap: 4 }}>
        <strong style={{ fontSize: 18, lineHeight: 1.2 }}>{title}</strong>
        <span style={{ fontSize: 13, lineHeight: 1.45, color: '#475569' }}>{text}</span>
      </figcaption>

      <div
        style={{
          display: 'grid',
          alignItems: 'center',
          gap: 12,
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${roundCount}, minmax(0, 1fr))`,
            gap: 8,
            alignItems: 'end',
          }}
          aria-label="Communication round progression"
        >
          {rounds.map((round) => (
            <button
              key={round.round}
              type="button"
              onClick={() => setActiveRound(round.round)}
              style={{
                minWidth: 0,
                height: Math.max(42, 54 + round.quality * 0.9),
                border: `1px solid ${round.active ? '#0f766e' : '#cbd5e1'}`,
                borderRadius: 6,
                background: round.completed ? '#ccfbf1' : '#ffffff',
                color: '#0f172a',
                padding: '8px 4px',
                display: 'grid',
                alignContent: 'end',
                gap: 6,
                cursor: 'pointer',
                transition: 'height 220ms ease, background 220ms ease, border-color 220ms ease, transform 220ms ease',
                transform: round.active ? 'translateY(-4px)' : 'translateY(0)',
              }}
              aria-pressed={round.active}
              aria-label={`${round.label}, quality ${round.quality} percent`}
            >
              <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                R{round.round}
              </span>
              <span style={{ fontSize: 11, color: '#0f766e' }}>{round.quality}%</span>
            </button>
          ))}
        </div>

        <div
          style={{
            minHeight: 72,
            borderRadius: 8,
            border: '1px solid #dbeafe',
            background: '#eff6ff',
            padding: 12,
            display: 'grid',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' }}>
            Active round {activeRound}
          </span>
          <span style={{ fontSize: 14, lineHeight: 1.45, color: '#1e293b' }}>
            {activeRound === 1
              ? 'The first response establishes a baseline.'
              : activeRound === roundCount
                ? 'The final response integrates the accumulated corrections.'
                : 'Feedback is incorporated and the next response becomes more aligned.'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>{componentKey} {version}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setActiveRound((current) => Math.max(1, current - 1))} style={{ border: '1px solid #cbd5e1', borderRadius: 6, background: '#ffffff', padding: '4px 8px', fontSize: 12 }}>
            Previous
          </button>
          <button type="button" onClick={() => setActiveRound((current) => (current >= roundCount ? 1 : current + 1))} style={{ border: '1px solid #0f766e', borderRadius: 6, background: '#0f766e', color: '#ffffff', padding: '4px 8px', fontSize: 12 }}>
            Next
          </button>
        </div>
      </div>
    </figure>
  );
}

export const buildInteractiveSandboxPayload = (
  element: InteractiveRenderableElement,
  componentKey: string,
  version: string,
  fallback: InteractiveFallback,
  siteId?: string,
): Record<string, unknown> => {
  const props = sanitizePublicInteractiveComponentMetadata(element.props) || {};
  delete props.sandboxUrl;
  delete props.iframeUrl;
  delete props.url;
  delete props.src;
  delete props.fallback;
  delete props.renderCapabilities;
  const publicContext = sanitizePublicInteractiveComponentMetadata({
    controls: Array.isArray(element.controls) ? element.controls : props.controls,
    dataBindings: Array.isArray(element.dataBindings) ? element.dataBindings : props.dataBindings,
  }) || {};
  const publicFallback = sanitizePublicInteractiveComponentMetadata(fallback) || {};
  if ('html' in publicFallback) publicFallback.html = sanitizeHtmlMarkup(publicFallback.html);
  if ('imageUrl' in publicFallback) publicFallback.imageUrl = fallbackImageUrl(publicFallback.imageUrl);

  return {
    type: 'backy.interactive-component.init',
    protocol: 'backy.interactive-component.v1',
    componentKey,
    version,
    props,
    controls: publicContext.controls,
    propsSchema: sanitizePublicInteractiveComponentMetadata(element.propsSchema),
    dataBindings: publicContext.dataBindings,
    readOnly: true,
    siteId,
    fallback: publicFallback,
  };
};

function SandboxedCodeComponentFrame({
  element,
  fallback,
  componentKey,
  version,
  src,
  renderCapabilities,
  siteId,
  pageId,
  postId,
  apiBaseUrl = '/api',
}: {
  element: InteractiveRenderableElement;
  fallback: InteractiveFallback;
  componentKey: string;
  version: string;
  src: string;
  renderCapabilities: Record<string, unknown>;
  siteId?: string;
  pageId?: string;
  postId?: string;
  apiBaseUrl?: string;
}) {
  const { props, styles } = element;
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const title = getNameClass(fallback.title) || getNameClass(props.title) || 'Sandboxed component';
  const iframeSandbox = normalizeInteractiveIframeSandbox(props.sandbox ?? renderCapabilities.sandbox);
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  const [runtimeError, setRuntimeError] = useState('');
  const payload = useMemo(
    () => buildInteractiveSandboxPayload(element, componentKey, version, fallback, siteId),
    [componentKey, element, fallback, siteId, version],
  );
  const reportRuntimeError = useCallback((message: string, messageType: string) => {
    if (!siteId || typeof window === 'undefined') {
      return;
    }

    const body = {
      type: messageType,
      componentKey,
      version,
      elementId: element.id,
      pageId,
      postId,
      message,
    };

    window.fetch(`${apiBaseUrl.replace(/\/+$/, '')}/sites/${encodeURIComponent(siteId)}/interactive-components/runtime-events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      // Runtime telemetry is diagnostic only; rendering should not depend on it.
    });
  }, [apiBaseUrl, componentKey, element.id, pageId, postId, siteId, version]);
  const postInitPayload = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const frame = frameRef.current;
    if (!frame?.contentWindow) {
      return;
    }

    const targetOrigin = interactiveIframeUsesOpaqueOrigin(iframeSandbox)
      ? '*'
      : new URL(src, window.location.origin).origin;
    frame.contentWindow.postMessage(payload, targetOrigin);
  }, [iframeSandbox, payload, src]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const timeout = window.setTimeout(postInitPayload, 0);

    return () => window.clearTimeout(timeout);
  }, [postInitPayload]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || !isRecord(event.data)) {
        return;
      }

      const protocol = getNameClass(event.data.protocol);
      if (protocol !== 'backy.interactive-component.v1') {
        return;
      }

      const messageComponentKey = getNameClass(event.data.componentKey);
      const messageVersion = getNameClass(event.data.version);
      if (messageComponentKey && messageComponentKey !== componentKey) {
        return;
      }
      if (messageVersion && messageVersion !== version) {
        return;
      }

      const messageType = getNameClass(event.data.type);
      if (messageType === 'backy.interactive-component.ready') {
        postInitPayload();
      }

      // Loading the module or resizing does not prove a mount/update succeeded.
      if (messageType === 'backy.interactive-component.rendered'
        && messageComponentKey === componentKey && messageVersion === version) {
        setRuntimeError('');
      }

      if (messageType === 'backy.interactive-component.resize') {
        const nextHeight = typeof event.data.height === 'number'
          ? event.data.height
          : typeof event.data.height === 'string'
            ? Number.parseFloat(event.data.height)
            : null;

        if (nextHeight !== null && Number.isFinite(nextHeight)) {
          setFrameHeight(Math.max(120, Math.min(2400, Math.round(nextHeight))));
        }
      }

      if (messageType === 'backy.interactive-component.error') {
        const message = getNameClass(event.data.message) || 'Interactive component failed to load.';
        setRuntimeError(message);
        reportRuntimeError(message, messageType);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [componentKey, postInitPayload, reportRuntimeError, version]);

  return (
    <div
      style={{
        display: 'grid',
        gap: runtimeError ? 8 : 0,
        width: '100%',
        height: '100%',
        minHeight: '100%',
      }}
      data-backy-interactive-component={componentKey}
      data-backy-interactive-version={version}
      data-backy-hydration-mode="sandbox-iframe"
      data-backy-sandboxed-code-component="true"
      data-backy-sandbox-runtime-error={runtimeError || undefined}
    >
      <iframe
        ref={frameRef}
        title={title}
        src={src}
        sandbox={iframeSandbox}
        allow={normalizeInteractiveIframeAllow(props.allow ?? renderCapabilities.allowedPermissions)}
        loading={normalizeIframeLoading(props.loading)}
        referrerPolicy="no-referrer"
        onLoad={postInitPayload}
        style={{
          width: '100%',
          height: frameHeight ? `${frameHeight}px` : '100%',
          minHeight: '100%',
          border: '1px solid #374151',
          borderRadius: 8,
          background: '#111827',
          color: '#f9fafb',
          ...styles,
        }}
        aria-label={getNameClass(fallback.ariaLabel) || title}
      />
      {runtimeError && (
        <p style={{ margin: 0, color: '#b91c1c', fontSize: 13, lineHeight: 1.4 }}>
          {runtimeError}
        </p>
      )}
    </div>
  );
}

/**
 * Render trusted built-in interactive components, otherwise keep a static
 * fallback until a registry bundle or sandbox runtime is mounted.
 */
export function InteractiveComponentElement({ element, siteId, pageId, postId, apiBaseUrl = '/api' }: InteractiveComponentElementProps) {
  const { props, styles } = element;
  const rawFallback = element.fallback ?? props.fallback;
  const fallback = typeof rawFallback === 'string'
    ? { text: rawFallback }
    : isRecord(rawFallback)
      ? rawFallback as InteractiveFallback
      : {};
  const title = getNameClass(fallback.title) || getNameClass(props.title) || getNameClass(props.componentKey) || element.componentKey || 'Interactive component';
  const text = getNameClass(fallback.text) || getNameClass(props.fallbackText) || 'Interactive content is available in supported frontends.';
  const html = sanitizeHtmlMarkup(fallback.html);
  const imageUrl = fallbackImageUrl(fallback.imageUrl);
  const alt = getNameClass(fallback.alt) || title;
  const componentKey = element.componentKey || getNameClass(props.componentKey);
  const version = element.version || getNameClass(props.version);
  const renderCapabilities = isRecord(element.renderCapabilities)
    ? element.renderCapabilities
    : isRecord(props.renderCapabilities)
      ? props.renderCapabilities
      : {};
  const hydrationMode = getNameClass(renderCapabilities.hydrationMode);

  if (element.type === 'interactiveFigure' && isBackyDataFigureKey(componentKey)
    && (Array.isArray(props.records) || props.source)) {
    return <BackyDataFigure config={{ ...props, componentKey } as BackyDataFigureConfig} siteId={siteId} apiBaseUrl={apiBaseUrl} />;
  }

  if (element.type === 'interactiveFigure' && componentKey === 'backy.figure.rounds') {
    return (
      <CommunicationRoundsFigure
        element={element}
        fallback={fallback}
        componentKey={componentKey}
        version={version || '1.0.0'}
      />
    );
  }

  const sandboxSrc = normalizeInteractiveSandboxUrl(props.sandboxUrl ?? props.iframeUrl ?? props.url ?? props.src);
  if (element.type === 'codeComponent' && hydrationMode === 'sandbox-iframe' && sandboxSrc) {
    return (
      <SandboxedCodeComponentFrame
        element={element}
        fallback={fallback}
        componentKey={componentKey || 'backy.custom.sandboxed'}
        version={version || '1.0.0'}
        src={sandboxSrc}
        renderCapabilities={renderCapabilities}
        siteId={siteId}
        pageId={pageId}
        postId={postId}
        apiBaseUrl={apiBaseUrl}
      />
    );
  }

  return (
    <figure
      style={{
        display: 'grid',
        alignContent: 'center',
        minHeight: '100%',
        margin: 0,
        padding: '16px',
        border: '1px solid #d1d5db',
        background: '#f9fafb',
        color: '#111827',
        ...styles,
      }}
      role="group"
      aria-label={getNameClass(fallback.ariaLabel) || title}
      data-backy-interactive-component={componentKey || undefined}
      data-backy-interactive-version={version || undefined}
      data-backy-hydration-mode="static-fallback"
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt={alt}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          loading="lazy"
        />
      )}
      <figcaption>
        <strong>{title}</strong>
        {html ? (
          <span dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span>{text}</span>
        )}
      </figcaption>
    </figure>
  );
}
