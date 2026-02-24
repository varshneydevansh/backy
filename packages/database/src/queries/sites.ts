/**
 * ============================================================================
 * SCYTHIAN CMS - SITE QUERIES
 * ============================================================================
 *
 * Database queries for site management including CRUD operations,
 * team-based filtering, and domain-related queries.
 *
 * @module SiteQueries
 * @author Scythian CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

import { getSupabaseClient } from '../client';
import type { Database } from '../types';

// ============================================
// TYPES
// ============================================

type SiteRow = Database['public']['Tables']['sites']['Row'];
type SiteInsert = Database['public']['Tables']['sites']['Insert'];
type SiteUpdate = Database['public']['Tables']['sites']['Update'];
type SupabaseQueryError = {
  message: string;
  code?: string;
};

type SupabaseQueryResult<T> = {
  data?: T;
  error?: SupabaseQueryError | null;
  count?: number | null;
};

function asQueryResult<T>(value: unknown): SupabaseQueryResult<T> {
  return value as SupabaseQueryResult<T>;
}

// ============================================
// READ QUERIES
// ============================================

/**
 * Get all sites for a team
 *
 * @param teamId - The team ID to filter by
 * @returns List of sites
 *
 * @example
 * ```ts
 * const sites = await getSitesByTeam('team-123');
 * ```
 */
export async function getSitesByTeam(teamId: string): Promise<SiteRow[]> {
  const supabase = getSupabaseClient();

  const { data, error } = asQueryResult<SiteRow[]>(
    await supabase
      .from('sites')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
  );

  if (error) {
    throw new Error(`Failed to fetch sites: ${error.message}`);
  }

  return data || [];
}

/**
 * Get a single site by ID
 *
 * @param siteId - The site ID
 * @returns Site or null if not found
 *
 * @example
 * ```ts
 * const site = await getSiteById('site-123');
 * if (site) {
 *   console.log(site.name);
 * }
 * ```
 */
export async function getSiteById(siteId: string): Promise<SiteRow | null> {
  const supabase = getSupabaseClient();

  const { data, error } = asQueryResult<SiteRow>(
    await supabase
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .single()
  );

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to fetch site: ${error.message}`);
  }

  return data || null;
}

/**
 * Get a site by its slug
 *
 * @param slug - The site slug
 * @param teamId - Optional team ID for additional filtering
 * @returns Site or null if not found
 */
export async function getSiteBySlug(
  slug: string,
  teamId?: string
): Promise<SiteRow | null> {
  const supabase = getSupabaseClient();

  const { data, error } = teamId
    ? (asQueryResult<SiteRow>(
        await supabase.from('sites').select('*').eq('slug', slug).eq('team_id', teamId).single()
      ))
    : (asQueryResult<SiteRow>(
        await supabase.from('sites').select('*').eq('slug', slug).single()
      ));

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to fetch site: ${error.message}`);
  }

  return data || null;
}

/**
 * Get a site by custom domain
 *
 * @param domain - The custom domain
 * @returns Site or null if not found
 */
export async function getSiteByDomain(domain: string): Promise<SiteRow | null> {
  const supabase = getSupabaseClient();

  const { data, error } = asQueryResult<SiteRow>(
    await supabase
      .from('sites')
      .select('*')
      .eq('custom_domain', domain)
      .eq('domain_status', 'active')
      .single()
  );

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to fetch site: ${error.message}`);
  }

  return data || null;
}

/**
 * Search sites by name
 *
 * @param search - Search query
 * @param teamId - Optional team ID to filter by
 * @returns Matching sites
 */
export async function searchSites(
  search: string,
  teamId?: string
): Promise<SiteRow[]> {
  const supabase = getSupabaseClient();

  const { data, error } = teamId
    ? (asQueryResult<SiteRow[]>(
        await supabase
          .from('sites')
          .select('*')
          .ilike('name', `%${search}%`)
          .eq('team_id', teamId)
          .order('name')
      ))
    : (asQueryResult<SiteRow[]>(
        await supabase
          .from('sites')
          .select('*')
          .ilike('name', `%${search}%`)
          .order('name')
      ));

  if (error) {
    throw new Error(`Failed to search sites: ${error.message}`);
  }

  return data || [];
}

// ============================================
// WRITE QUERIES
// ============================================

/**
 * Create a new site
 *
 * @param site - Site data to insert
 * @returns Created site
 *
 * @example
 * ```ts
 * const newSite = await createSite({
 *   team_id: 'team-123',
 *   name: 'My New Site',
 *   slug: 'my-new-site'
 * });
 * ```
 */
export async function createSite(site: SiteInsert): Promise<SiteRow> {
  const supabase = getSupabaseClient();

  const { data, error } = asQueryResult<SiteRow>(
    await supabase.from('sites').insert(site).select().single()
  );

  if (error) {
    throw new Error(`Failed to create site: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to create site: No data returned');
  }

  return data;
}

/**
 * Update a site
 *
 * @param siteId - Site ID to update
 * @param updates - Fields to update
 * @returns Updated site
 *
 * @example
 * ```ts
 * const updated = await updateSite('site-123', {
 *   name: 'Updated Name',
 *   is_published: true
 * });
 * ```
 */
export async function updateSite(
  siteId: string,
  updates: SiteUpdate
): Promise<SiteRow> {
  const supabase = getSupabaseClient();

  const { data, error } = asQueryResult<SiteRow>(
    await supabase
      .from('sites')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', siteId)
      .select()
      .single()
  );

  if (error) {
    throw new Error(`Failed to update site: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to update site: No data returned');
  }

  return data;
}

/**
 * Delete a site
 *
 * @param siteId - Site ID to delete
 * @returns True if deleted
 *
 * @example
 * ```ts
 * await deleteSite('site-123');
 * ```
 */
export async function deleteSite(siteId: string): Promise<boolean> {
  const supabase = getSupabaseClient();

  const { error } = asQueryResult<unknown>(
    await supabase.from('sites').delete().eq('id', siteId)
  );

  if (error) {
    throw new Error(`Failed to delete site: ${error.message}`);
  }

  return true;
}

// ============================================
// PUBLISHING QUERIES
// ============================================

/**
 * Publish a site
 *
 * @param siteId - Site ID to publish
 * @returns Updated site
 */
export async function publishSite(siteId: string): Promise<SiteRow> {
  return updateSite(siteId, {
    is_published: true,
    published_at: new Date().toISOString(),
  });
}

/**
 * Unpublish a site
 *
 * @param siteId - Site ID to unpublish
 * @returns Updated site
 */
export async function unpublishSite(siteId: string): Promise<SiteRow> {
  return updateSite(siteId, {
    is_published: false,
    published_at: null,
  });
}

// ============================================
// STATS QUERIES
// ============================================

/**
 * Get site statistics
 *
 * @param siteId - Site ID
 * @returns Site statistics
 */
export async function getSiteStats(siteId: string): Promise<{
  pageCount: number;
  postCount: number;
  mediaCount: number;
  totalMediaSize: number;
}> {
  const supabase = getSupabaseClient();

  // Get page count
  const { count: pageCount, error: pageError } = asQueryResult<unknown>(
    await supabase
      .from('pages')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId)
  );

  if (pageError) {
    throw new Error(`Failed to get page count: ${pageError.message}`);
  }

  // Get post count
  const { count: postCount, error: postError } = asQueryResult<unknown>(
    await supabase
      .from('blog_posts')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId)
  );

  if (postError) {
    throw new Error(`Failed to get post count: ${postError.message}`);
  }

  // Get media stats
  const { data: mediaData, error: mediaError } = asQueryResult<
    Array<{ size_bytes?: number }>
  >(
    await supabase
      .from('media')
      .select('size_bytes')
      .eq('site_id', siteId)
  );

  if (mediaError) {
    throw new Error(`Failed to get media stats: ${mediaError.message}`);
  }

  const mediaCount = mediaData?.length || 0;
  const totalMediaSize =
    mediaData?.reduce((sum: number, m: { size_bytes?: number }) => sum + (m.size_bytes || 0), 0) ||
    0;

  return {
    pageCount: pageCount || 0,
    postCount: postCount || 0,
    mediaCount,
    totalMediaSize,
  };
}
