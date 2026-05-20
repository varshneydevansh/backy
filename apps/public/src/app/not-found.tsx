import type { Metadata } from 'next';
import { PublicRouteState } from '@/components/PublicRouteState';

export const metadata: Metadata = {
  title: 'Page not found | Backy',
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound() {
  return (
    <PublicRouteState
      kind="not-found"
      statusCode={404}
      code="NOT_FOUND"
      title="Page not found"
      message="This Backy site route, page, post, or collection record is not published or does not exist."
      primaryAction={{ label: 'Open public home', href: '/' }}
      secondaryAction={{ label: 'Open admin', href: '/admin' }}
    />
  );
}
