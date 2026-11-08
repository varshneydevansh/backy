import { useCallback, useEffect, useState } from 'react';
import { listSites } from '@/lib/adminContentApi';
import { useAuthStore } from '@/stores/authStore';
import { useStore } from '@/stores/mockStore';

/** Load the authorized site directory on every protected-shell/account entry. */
export function useCanonicalSites() {
  const userId = useAuthStore(state => state.user?.id);
  const setSites = useStore(state => state.setSites);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setSites([]);
    setError('');
    if (userId) void listSites().then(sites => {
      if (active) setSites(sites);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Unable to load websites.');
    });
    return () => { active = false; };
  }, [userId, attempt, setSites]);
  return { error, retry };
}
