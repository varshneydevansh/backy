import type { Metadata } from 'next';
import { PublicRouteState } from '@/components/PublicRouteState';

export const metadata: Metadata = {
  title: 'Authentication required | Backy',
  robots: {
    index: false,
    follow: false,
  },
};

export default function Unauthorized() {
  return (
    <PublicRouteState
      kind="auth-required"
      statusCode={401}
      code="AUTH_REQUIRED"
      title="Authentication required"
      message="This Backy route is available only after a valid session is present."
      primaryAction={{ label: 'Open admin login', href: '/admin/login' }}
      secondaryAction={{ label: 'Open public home', href: '/' }}
    />
  );
}
