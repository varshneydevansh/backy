'use client';

import React, { useCallback } from 'react';
import { DataFigure } from '@backy-cms/editor/data-figure';
import { loadBackyPublicDataFigureRecords } from '@backy-cms/core';
import type { BackyDataFigureConfig, BackyDataFigureLoader } from '@backy-cms/core';

/** Hosted figures refresh only the selected site's published, public collection. */
export function BackyDataFigure({ config, siteId, apiBaseUrl = '/api' }: { config: BackyDataFigureConfig; siteId?: string; apiBaseUrl?: string }) {
  const loadRecords = useCallback<BackyDataFigureLoader>((collectionId, { signal, requestedFields }) => {
    if (!siteId) return Promise.reject(new Error('This data source is unavailable here.'));
    return loadBackyPublicDataFigureRecords({ apiBaseUrl, siteId, collectionId, signal, requestedFields });
  }, [apiBaseUrl, siteId]);
  return <DataFigure config={config} loadRecords={siteId ? loadRecords : undefined} />;
}
