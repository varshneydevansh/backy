'use client';

import { useEffect } from 'react';
import { PublicRouteState } from '@/components/PublicRouteState';

interface PublicErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PublicError({ error, reset }: PublicErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PublicRouteState
      kind="error"
      statusCode={500}
      code="INTERNAL_SERVER_ERROR"
      title="Page could not render"
      message="The public page renderer hit an unexpected problem. The API response stays normalized, and the hosted shell can be retried without exposing internal details."
      onRetry={reset}
      secondaryAction={{ label: 'Open public home', href: '/' }}
    />
  );
}
