import type { CSSProperties } from 'react';

type PublicRouteStateKind = 'not-found' | 'auth-required' | 'forbidden' | 'error';

interface PublicRouteStateAction {
  label: string;
  href: string;
}

interface PublicRouteStateProps {
  kind: PublicRouteStateKind;
  statusCode: 401 | 403 | 404 | 500;
  code: 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INTERNAL_SERVER_ERROR';
  title: string;
  message: string;
  primaryAction?: PublicRouteStateAction;
  secondaryAction?: PublicRouteStateAction;
  onRetry?: () => void;
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: '48px 20px',
  background: '#f8fafc',
  color: '#0f172a',
};

const shellStyle: CSSProperties = {
  width: 'min(100%, 760px)',
  display: 'grid',
  gap: 24,
};

const statusStyle: CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: 16,
  display: 'grid',
  placeItems: 'center',
  background: '#0f172a',
  color: '#ffffff',
  fontSize: 24,
  fontWeight: 800,
  lineHeight: 1,
};

const contentStyle: CSSProperties = {
  display: 'grid',
  gap: 14,
};

const eyebrowStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 0,
  textTransform: 'uppercase',
  color: '#475569',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 42,
  lineHeight: 1.08,
  letterSpacing: 0,
};

const messageStyle: CSSProperties = {
  margin: 0,
  maxWidth: 620,
  color: '#475569',
  fontSize: 17,
  lineHeight: 1.6,
};

const actionRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  alignItems: 'center',
};

const primaryActionStyle: CSSProperties = {
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '10px 16px',
  borderRadius: 8,
  border: '1px solid #0f172a',
  background: '#0f172a',
  color: '#ffffff',
  fontSize: 14,
  fontWeight: 800,
};

const secondaryActionStyle: CSSProperties = {
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '10px 16px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#0f172a',
  fontSize: 14,
  fontWeight: 800,
};

const retryButtonStyle: CSSProperties = {
  ...primaryActionStyle,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const contractStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  paddingTop: 4,
  color: '#64748b',
  fontSize: 13,
};

export function PublicRouteState({
  kind,
  statusCode,
  code,
  title,
  message,
  primaryAction,
  secondaryAction,
  onRetry,
}: PublicRouteStateProps) {
  const role = kind === 'not-found' ? 'status' : 'alert';

  return (
    <main
      role={role}
      aria-live={kind === 'not-found' ? 'polite' : 'assertive'}
      data-backy-public-route-state={kind}
      data-backy-error-status={statusCode}
      data-backy-error-code={code}
      data-backy-route-state-contract="backy.public-route-state.v1"
      style={pageStyle}
    >
      <section style={shellStyle} aria-labelledby="backy-public-route-state-title">
        <div style={statusStyle} aria-hidden="true">
          {statusCode}
        </div>
        <div style={contentStyle}>
          <p style={eyebrowStyle}>{code}</p>
          <h1 id="backy-public-route-state-title" style={titleStyle}>
            {title}
          </h1>
          <p style={messageStyle}>{message}</p>
        </div>
        <div style={actionRowStyle}>
          {onRetry ? (
            <button type="button" onClick={onRetry} style={retryButtonStyle}>
              Try again
            </button>
          ) : null}
          {primaryAction ? (
            <a href={primaryAction.href} style={primaryActionStyle}>
              {primaryAction.label}
            </a>
          ) : null}
          {secondaryAction ? (
            <a href={secondaryAction.href} style={secondaryActionStyle}>
              {secondaryAction.label}
            </a>
          ) : null}
        </div>
        <div
          aria-label="Backy route state contract"
          data-backy-public-route-contract-details="true"
          style={contractStyle}
        >
          <span>Public API clients receive the matching normalized error code through Backy JSON endpoints.</span>
          <span>Hosted pages expose stable data attributes for custom shell, analytics, and recovery UI.</span>
        </div>
      </section>
    </main>
  );
}

export default PublicRouteState;
