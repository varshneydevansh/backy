import type { Metadata } from 'next';
import { PublicRouteState } from '@/components/PublicRouteState';

export const metadata: Metadata = {
  title: 'Access forbidden | Backy',
  robots: {
    index: false,
    follow: false,
  },
};

export default function Forbidden() {
  return (
    <PublicRouteState
      kind="forbidden"
      statusCode={403}
      code="FORBIDDEN"
      title="Access forbidden"
      message="This Backy route exists, but the current account does not have permission to view it."
      primaryAction={{ label: 'Open admin', href: '/admin' }}
      secondaryAction={{ label: 'Open public home', href: '/' }}
    />
  );
}
