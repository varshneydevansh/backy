/**
 * ============================================================================
 * SCYTHIAN CMS - DATABASE TYPES
 * ============================================================================
 *
 * TypeScript types generated from the Supabase database schema.
 * These types ensure type safety when querying the database.
 *
 * @module DatabaseTypes
 * @author Scythian CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

// ============================================
// DATABASE SCHEMA TYPES
// ============================================

/**
 * Complete database schema type definition
 *
 * This type represents the entire Supabase database structure
 * and is used for type-safe queries.
 */
export interface Database {
  public: {
    Tables: {
      // --- User Tables ---
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: 'admin' | 'editor' | 'viewer';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: 'admin' | 'editor' | 'viewer';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: 'admin' | 'editor' | 'viewer';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      teams: {
        Row: {
          id: string;
          name: string;
          slug: string;
          owner_id: string;
          settings: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          owner_id: string;
          settings?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          owner_id?: string;
          settings?: Record<string, unknown>;
          created_at?: string;
        };
      };

      team_members: {
        Row: {
          id: string;
          team_id: string;
          user_id: string;
          role: 'admin' | 'editor' | 'viewer';
          joined_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          user_id: string;
          role?: 'admin' | 'editor' | 'viewer';
          joined_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          user_id?: string;
          role?: 'admin' | 'editor' | 'viewer';
          joined_at?: string;
        };
      };

      // --- Site Tables ---
      sites: {
        Row: {
          id: string;
          team_id: string;
          name: string;
          slug: string;
          description: string | null;
          custom_domain: string | null;
          domain_status: 'pending' | 'active' | 'error' | 'expired';
          ssl_enabled: boolean;
          theme: Record<string, unknown>;
          settings: Record<string, unknown>;
          is_published: boolean;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          name: string;
          slug: string;
          description?: string | null;
          custom_domain?: string | null;
          domain_status?: 'pending' | 'active' | 'error' | 'expired';
          ssl_enabled?: boolean;
          theme?: Record<string, unknown>;
          settings?: Record<string, unknown>;
          is_published?: boolean;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          custom_domain?: string | null;
          domain_status?: 'pending' | 'active' | 'error' | 'expired';
          ssl_enabled?: boolean;
          theme?: Record<string, unknown>;
          settings?: Record<string, unknown>;
          is_published?: boolean;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      // --- Page Tables ---
      pages: {
        Row: {
          id: string;
          site_id: string;
          title: string;
          slug: string;
          description: string | null;
          content: Record<string, unknown>;
          meta: Record<string, unknown>;
          status: 'draft' | 'published' | 'scheduled' | 'archived';
          published_at: string | null;
          scheduled_at: string | null;
          is_homepage: boolean;
          parent_id: string | null;
          sort_order: number;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          title: string;
          slug: string;
          description?: string | null;
          content?: Record<string, unknown>;
          meta?: Record<string, unknown>;
          status?: 'draft' | 'published' | 'scheduled' | 'archived';
          published_at?: string | null;
          scheduled_at?: string | null;
          is_homepage?: boolean;
          parent_id?: string | null;
          sort_order?: number;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          title?: string;
          slug?: string;
          description?: string | null;
          content?: Record<string, unknown>;
          meta?: Record<string, unknown>;
          status?: 'draft' | 'published' | 'scheduled' | 'archived';
          published_at?: string | null;
          scheduled_at?: string | null;
          is_homepage?: boolean;
          parent_id?: string | null;
          sort_order?: number;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      page_versions: {
        Row: {
          id: string;
          page_id: string;
          content: Record<string, unknown>;
          created_by: string | null;
          created_at: string;
          note: string | null;
        };
        Insert: {
          id?: string;
          page_id: string;
          content: Record<string, unknown>;
          created_by?: string | null;
          created_at?: string;
          note?: string | null;
        };
        Update: {
          id?: string;
          page_id?: string;
          content?: Record<string, unknown>;
          created_by?: string | null;
          created_at?: string;
          note?: string | null;
        };
      };

      // --- Blog Tables ---
      blog_posts: {
        Row: {
          id: string;
          site_id: string;
          title: string;
          slug: string;
          excerpt: string | null;
          content: unknown;
          content_format: 'editor' | 'markdown' | 'html';
          featured_image_id: string | null;
          category_ids: string[];
          tag_ids: string[];
          author_id: string | null;
          status: 'draft' | 'published' | 'scheduled' | 'archived';
          published_at: string | null;
          scheduled_at: string | null;
          meta: Record<string, unknown>;
          view_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          title: string;
          slug: string;
          excerpt?: string | null;
          content: unknown;
          content_format?: 'editor' | 'markdown' | 'html';
          featured_image_id?: string | null;
          category_ids?: string[];
          tag_ids?: string[];
          author_id?: string | null;
          status?: 'draft' | 'published' | 'scheduled' | 'archived';
          published_at?: string | null;
          scheduled_at?: string | null;
          meta?: Record<string, unknown>;
          view_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          title?: string;
          slug?: string;
          excerpt?: string | null;
          content?: unknown;
          content_format?: 'editor' | 'markdown' | 'html';
          featured_image_id?: string | null;
          category_ids?: string[];
          tag_ids?: string[];
          author_id?: string | null;
          status?: 'draft' | 'published' | 'scheduled' | 'archived';
          published_at?: string | null;
          scheduled_at?: string | null;
          meta?: Record<string, unknown>;
          view_count?: number;
          created_at?: string;
          updated_at?: string;
        };
      };

      blog_categories: {
        Row: {
          id: string;
          site_id: string;
          name: string;
          slug: string;
          description: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          slug: string;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
        };
      };

      blog_tags: {
        Row: {
          id: string;
          site_id: string;
          name: string;
          slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          slug: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          name?: string;
          slug?: string;
          created_at?: string;
        };
      };

      // --- Media Tables ---
      media: {
        Row: {
          id: string;
          site_id: string;
          filename: string;
          original_name: string;
          mime_type: string;
          size_bytes: number;
          type: 'image' | 'video' | 'audio' | 'document' | 'other';
          url: string;
          thumbnail_url: string | null;
          folder_id: string | null;
          page_ids: string[];
          post_ids: string[];
          tags: string[];
          metadata: Record<string, unknown>;
          alt_text: string | null;
          caption: string | null;
          uploaded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          filename: string;
          original_name: string;
          mime_type: string;
          size_bytes: number;
          type: 'image' | 'video' | 'audio' | 'document' | 'other';
          url: string;
          thumbnail_url?: string | null;
          folder_id?: string | null;
          page_ids?: string[];
          post_ids?: string[];
          tags?: string[];
          metadata?: Record<string, unknown>;
          alt_text?: string | null;
          caption?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          filename?: string;
          original_name?: string;
          mime_type?: string;
          size_bytes?: number;
          type?: 'image' | 'video' | 'audio' | 'document' | 'other';
          url?: string;
          thumbnail_url?: string | null;
          folder_id?: string | null;
          page_ids?: string[];
          post_ids?: string[];
          tags?: string[];
          metadata?: Record<string, unknown>;
          alt_text?: string | null;
          caption?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      media_folders: {
        Row: {
          id: string;
          site_id: string;
          parent_id: string | null;
          name: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          parent_id?: string | null;
          name: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          parent_id?: string | null;
          name?: string;
          sort_order?: number;
          created_at?: string;
        };
      };

      media_pages: {
        Row: {
          id: string;
          media_id: string;
          page_id: string;
          usage_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          media_id: string;
          page_id: string;
          usage_type?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          media_id?: string;
          page_id?: string;
          usage_type?: string;
          created_at?: string;
        };
      };

      // --- Domain Tables ---
      domain_mappings: {
        Row: {
          id: string;
          site_id: string;
          domain: string;
          subdomain: string | null;
          full_domain: string;
          verification_record: string;
          is_verified: boolean;
          verified_at: string | null;
          ssl_status: 'pending' | 'active' | 'error' | 'expired';
          ssl_certificate: string | null;
          ssl_expires_at: string | null;
          force_https: boolean;
          redirect_rules: unknown[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          domain: string;
          subdomain?: string | null;
          full_domain: string;
          verification_record: string;
          is_verified?: boolean;
          verified_at?: string | null;
          ssl_status?: 'pending' | 'active' | 'error' | 'expired';
          ssl_certificate?: string | null;
          ssl_expires_at?: string | null;
          force_https?: boolean;
          redirect_rules?: unknown[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          domain?: string;
          subdomain?: string | null;
          full_domain?: string;
          verification_record?: string;
          is_verified?: boolean;
          verified_at?: string | null;
          ssl_status?: 'pending' | 'active' | 'error' | 'expired';
          ssl_certificate?: string | null;
          ssl_expires_at?: string | null;
          force_https?: boolean;
          redirect_rules?: unknown[];
          created_at?: string;
          updated_at?: string;
        };
      };

      custom_links: {
        Row: {
          id: string;
          site_id: string;
          source_path: string;
          target_type: 'page' | 'post' | 'url' | 'file';
          target_page_id: string | null;
          target_post_id: string | null;
          target_url: string | null;
          is_permanent: boolean;
          open_in_new_tab: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          source_path: string;
          target_type?: 'page' | 'post' | 'url' | 'file';
          target_page_id?: string | null;
          target_post_id?: string | null;
          target_url?: string | null;
          is_permanent?: boolean;
          open_in_new_tab?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          source_path?: string;
          target_type?: 'page' | 'post' | 'url' | 'file';
          target_page_id?: string | null;
          target_post_id?: string | null;
          target_url?: string | null;
          is_permanent?: boolean;
          open_in_new_tab?: boolean;
          created_at?: string;
        };
      };

      // --- Analytics Tables ---
      activity_logs: {
        Row: {
          id: string;
          site_id: string | null;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          details: Record<string, unknown>;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id?: string | null;
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          details?: Record<string, unknown>;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string | null;
          user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          details?: Record<string, unknown>;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };

      page_views: {
        Row: {
          id: string;
          site_id: string;
          page_id: string | null;
          session_id: string | null;
          referrer: string | null;
          path: string;
          country: string | null;
          device_type: string | null;
          browser: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          page_id?: string | null;
          session_id?: string | null;
          referrer?: string | null;
          path: string;
          country?: string | null;
          device_type?: string | null;
          browser?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          page_id?: string | null;
          session_id?: string | null;
          referrer?: string | null;
          path?: string;
          country?: string | null;
          device_type?: string | null;
          browser?: string | null;
          created_at?: string;
        };
      };
    };

    Views: {
      // Add any database views here
    };

    Functions: {
      // Add any database functions here
    };

    Enums: {
      user_role: 'admin' | 'editor' | 'viewer';
      domain_status: 'pending' | 'active' | 'error' | 'expired';
      ssl_status: 'pending' | 'active' | 'error' | 'expired';
      page_status: 'draft' | 'published' | 'scheduled' | 'archived';
      content_format: 'editor' | 'markdown' | 'html';
      media_type: 'image' | 'video' | 'audio' | 'document' | 'other';
      link_target_type: 'page' | 'post' | 'url' | 'file';
      activity_action: 'created' | 'updated' | 'deleted' | 'published' | 'unpublished' | 'login' | 'logout' | 'invite_sent';
      entity_type: 'site' | 'page' | 'post' | 'media' | 'user' | 'setting';
    };
  };
}

// ============================================
// HELPER TYPES
// ============================================

/**
 * Extract row type from a table
 */
export type TableRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

/**
 * Extract insert type from a table
 */
export type TableInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

/**
 * Extract update type from a table
 */
export type TableUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

/**
 * Extract enum type
 */
export type EnumType<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];
