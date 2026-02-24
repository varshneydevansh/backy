/**
 * ============================================================================
 * SCYTHIAN CMS - ADMIN ENTRY POINT
 * ============================================================================
 *
 * This is the main entry point for the Scythian CMS Admin Dashboard.
 * It initializes React, sets up the query client, and renders the app.
 *
 * @module AdminEntry
 * @author Scythian CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

// ============================================
// QUERY CLIENT SETUP
// ============================================

/**
 * React Query client configuration
 *
 * We use React Query for server state management. It handles:
 * - Caching
 * - Background refetching
 * - Optimistic updates
 * - Error handling
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

// ============================================
// RENDER APP
// ============================================

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
