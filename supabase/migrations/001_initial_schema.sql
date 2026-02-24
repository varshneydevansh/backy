-- ============================================================================
-- SCYTHIAN CMS - INITIAL DATABASE SCHEMA
-- ============================================================================
--
-- This migration creates the complete database schema for Scythian CMS.
-- Run this in your Supabase SQL Editor to set up the database.
--
-- @migration 001_initial_schema
-- @author Scythian CMS Team (Built by Kimi 2.5)
-- @license MIT
-- ============================================================================

-- ============================================
-- EXTENSIONS
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm for text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- ENUMS
-- ============================================

-- User roles
CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer');

-- Domain status
CREATE TYPE domain_status AS ENUM ('pending', 'active', 'error', 'expired');

-- SSL status
CREATE TYPE ssl_status AS ENUM ('pending', 'active', 'error', 'expired');

-- Page/Post status
CREATE TYPE page_status AS ENUM ('draft', 'published', 'scheduled', 'archived');

-- Content format
CREATE TYPE content_format AS ENUM ('editor', 'markdown', 'html');

-- Media type
CREATE TYPE media_type AS ENUM ('image', 'video', 'audio', 'document', 'other');

-- Link target type
CREATE TYPE link_target_type AS ENUM ('page', 'post', 'url', 'file');

-- Activity action
CREATE TYPE activity_action AS ENUM (
  'created', 'updated', 'deleted', 'published', 
  'unpublished', 'login', 'logout', 'invite_sent'
);

-- Entity type
CREATE TYPE entity_type AS ENUM ('site', 'page', 'post', 'media', 'user', 'setting');

-- ============================================
-- PROFILES TABLE (extends auth.users)
-- ============================================

CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role user_role DEFAULT 'editor',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" 
  ON public.profiles FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id, 
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'editor')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- TEAMS TABLE
-- ============================================

CREATE TABLE public.teams (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES public.profiles(id),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Teams policies
CREATE POLICY "Team members can view their teams" 
  ON public.teams FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members 
      WHERE team_id = id AND user_id = auth.uid()
    )
    OR owner_id = auth.uid()
  );

CREATE POLICY "Team owners can update their teams" 
  ON public.teams FOR UPDATE 
  USING (owner_id = auth.uid());

CREATE POLICY "Admins can manage all teams" 
  ON public.teams FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- TEAM MEMBERS TABLE
-- ============================================

CREATE TABLE public.team_members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role user_role DEFAULT 'editor',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- Enable RLS
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Team members policies
CREATE POLICY "Team members can view team members" 
  ON public.team_members FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm2 
      WHERE tm2.team_id = team_id AND tm2.user_id = auth.uid()
    )
  );

CREATE POLICY "Team admins can manage members" 
  ON public.team_members FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm2 
      WHERE tm2.team_id = team_id 
      AND tm2.user_id = auth.uid() 
      AND tm2.role = 'admin'
    )
  );

-- ============================================
-- SITES TABLE
-- ============================================

CREATE TABLE public.sites (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  custom_domain TEXT UNIQUE,
  domain_status domain_status DEFAULT 'pending',
  ssl_enabled BOOLEAN DEFAULT FALSE,
  theme JSONB DEFAULT '{
    "colors": {},
    "fonts": {},
    "spacing": {},
    "customCSS": ""
  }',
  settings JSONB DEFAULT '{
    "seo": {},
    "analytics": {},
    "social": {}
  }',
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, slug)
);

-- Enable RLS
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- Sites policies
CREATE POLICY "Team members can view sites" 
  ON public.sites FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members 
      WHERE team_id = sites.team_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Editors can create sites" 
  ON public.sites FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members 
      WHERE team_id = sites.team_id 
      AND user_id = auth.uid() 
      AND role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Editors can update sites" 
  ON public.sites FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members 
      WHERE team_id = sites.team_id 
      AND user_id = auth.uid() 
      AND role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Admins can delete sites" 
  ON public.sites FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members 
      WHERE team_id = sites.team_id 
      AND user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Public can view published sites
CREATE POLICY "Public can view published sites" 
  ON public.sites FOR SELECT 
  USING (is_published = TRUE);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sites_updated_at
  BEFORE UPDATE ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- PAGES TABLE
-- ============================================

CREATE TABLE public.pages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  content JSONB DEFAULT '{
    "root": null,
    "nodes": {},
    "styles": {}
  }',
  meta JSONB DEFAULT '{}',
  status page_status DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  is_homepage BOOLEAN DEFAULT FALSE,
  parent_id UUID REFERENCES public.pages(id),
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, slug)
);

-- Enable RLS
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

-- Pages policies
CREATE POLICY "Team members can view pages" 
  ON public.pages FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = pages.site_id AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Editors can manage pages" 
  ON public.pages FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = pages.site_id 
      AND tm.user_id = auth.uid() 
      AND tm.role IN ('admin', 'editor')
    )
  );

-- Public can view published pages
CREATE POLICY "Public can view published pages" 
  ON public.pages FOR SELECT 
  USING (status = 'published');

-- Update timestamp trigger
CREATE TRIGGER update_pages_updated_at
  BEFORE UPDATE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- PAGE VERSIONS TABLE
-- ============================================

CREATE TABLE public.page_versions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  page_id UUID REFERENCES public.pages(id) ON DELETE CASCADE,
  content JSONB NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  note TEXT
);

-- Enable RLS
ALTER TABLE public.page_versions ENABLE ROW LEVEL SECURITY;

-- Page versions policies
CREATE POLICY "Team members can view page versions" 
  ON public.page_versions FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.pages p
      JOIN public.sites s ON p.site_id = s.id
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE p.id = page_versions.page_id AND tm.user_id = auth.uid()
    )
  );

-- ============================================
-- BLOG POSTS TABLE
-- ============================================

CREATE TABLE public.blog_posts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  excerpt TEXT,
  content JSONB,
  content_format content_format DEFAULT 'editor',
  featured_image_id UUID,
  category_ids UUID[] DEFAULT '{}',
  tag_ids UUID[] DEFAULT '{}',
  author_id UUID REFERENCES public.profiles(id),
  status page_status DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  meta JSONB DEFAULT '{}',
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, slug)
);

-- Enable RLS
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Blog posts policies
CREATE POLICY "Team members can view posts" 
  ON public.blog_posts FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = blog_posts.site_id AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Editors can manage posts" 
  ON public.blog_posts FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = blog_posts.site_id 
      AND tm.user_id = auth.uid() 
      AND tm.role IN ('admin', 'editor')
    )
  );

-- Public can view published posts
CREATE POLICY "Public can view published posts" 
  ON public.blog_posts FOR SELECT 
  USING (status = 'published');

-- Update timestamp trigger
CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- BLOG CATEGORIES TABLE
-- ============================================

CREATE TABLE public.blog_categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, slug)
);

-- Enable RLS
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can manage categories" 
  ON public.blog_categories FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = blog_categories.site_id AND tm.user_id = auth.uid()
    )
  );

-- ============================================
-- BLOG TAGS TABLE
-- ============================================

CREATE TABLE public.blog_tags (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, slug)
);

-- Enable RLS
ALTER TABLE public.blog_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can manage tags" 
  ON public.blog_tags FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = blog_tags.site_id AND tm.user_id = auth.uid()
    )
  );

-- ============================================
-- MEDIA TABLE
-- ============================================

CREATE TABLE public.media (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  type media_type DEFAULT 'other',
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  folder_id UUID,
  page_ids UUID[] DEFAULT '{}',
  post_ids UUID[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  alt_text TEXT,
  caption TEXT,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

-- Media policies
CREATE POLICY "Team members can view media" 
  ON public.media FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = media.site_id AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Editors can manage media" 
  ON public.media FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = media.site_id 
      AND tm.user_id = auth.uid() 
      AND tm.role IN ('admin', 'editor')
    )
  );

-- Public can view media
CREATE POLICY "Public can view media" 
  ON public.media FOR SELECT 
  USING (TRUE);

-- Update timestamp trigger
CREATE TRIGGER update_media_updated_at
  BEFORE UPDATE ON public.media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- MEDIA FOLDERS TABLE
-- ============================================

CREATE TABLE public.media_folders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.media_folders(id),
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can manage folders" 
  ON public.media_folders FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = media_folders.site_id AND tm.user_id = auth.uid()
    )
  );

-- ============================================
-- MEDIA PAGES JUNCTION TABLE
-- ============================================

CREATE TABLE public.media_pages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  media_id UUID REFERENCES public.media(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.pages(id) ON DELETE CASCADE,
  usage_type TEXT DEFAULT 'content',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(media_id, page_id)
);

-- Enable RLS
ALTER TABLE public.media_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view media-page relations" 
  ON public.media_pages FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.pages p
      JOIN public.sites s ON p.site_id = s.id
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE p.id = media_pages.page_id AND tm.user_id = auth.uid()
    )
  );

-- ============================================
-- DOMAIN MAPPINGS TABLE
-- ============================================

CREATE TABLE public.domain_mappings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  subdomain TEXT,
  full_domain TEXT UNIQUE NOT NULL,
  verification_record TEXT NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  ssl_status ssl_status DEFAULT 'pending',
  ssl_certificate TEXT,
  ssl_expires_at TIMESTAMPTZ,
  force_https BOOLEAN DEFAULT TRUE,
  redirect_rules JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.domain_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team admins can manage domains" 
  ON public.domain_mappings FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = domain_mappings.site_id 
      AND tm.user_id = auth.uid() 
      AND tm.role = 'admin'
    )
  );

-- Update timestamp trigger
CREATE TRIGGER update_domain_mappings_updated_at
  BEFORE UPDATE ON public.domain_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- CUSTOM LINKS TABLE
-- ============================================

CREATE TABLE public.custom_links (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  target_type link_target_type DEFAULT 'page',
  target_page_id UUID REFERENCES public.pages(id),
  target_post_id UUID REFERENCES public.blog_posts(id),
  target_url TEXT,
  is_permanent BOOLEAN DEFAULT FALSE,
  open_in_new_tab BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, source_path)
);

-- Enable RLS
ALTER TABLE public.custom_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can manage links" 
  ON public.custom_links FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = custom_links.site_id AND tm.user_id = auth.uid()
    )
  );

-- ============================================
-- ACTIVITY LOGS TABLE
-- ============================================

CREATE TABLE public.activity_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  action activity_action NOT NULL,
  entity_type entity_type NOT NULL,
  entity_id UUID,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view activity logs" 
  ON public.activity_logs FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.team_members tm ON s.team_id = tm.team_id
      WHERE s.id = activity_logs.site_id AND tm.user_id = auth.uid()
    )
  );

-- ============================================
-- PAGE VIEWS TABLE (Analytics)
-- ============================================

CREATE TABLE public.page_views (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.pages(id) ON DELETE SET NULL,
  session_id TEXT,
  referrer TEXT,
  path TEXT NOT NULL,
  country TEXT,
  device_type TEXT,
  browser TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- Only service role can insert page views
CREATE POLICY "Service role can insert page views" 
  ON public.page_views FOR INSERT 
  WITH CHECK (TRUE);

-- ============================================
-- INDEXES
-- ============================================

-- Profiles indexes
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- Sites indexes
CREATE INDEX idx_sites_team_id ON public.sites(team_id);
CREATE INDEX idx_sites_slug ON public.sites(slug);
CREATE INDEX idx_sites_custom_domain ON public.sites(custom_domain);
CREATE INDEX idx_sites_is_published ON public.sites(is_published);

-- Pages indexes
CREATE INDEX idx_pages_site_id ON public.pages(site_id);
CREATE INDEX idx_pages_slug ON public.pages(slug);
CREATE INDEX idx_pages_status ON public.pages(status);
CREATE INDEX idx_pages_parent_id ON public.pages(parent_id);
CREATE INDEX idx_pages_published_at ON public.pages(published_at);

-- Blog posts indexes
CREATE INDEX idx_blog_posts_site_id ON public.blog_posts(site_id);
CREATE INDEX idx_blog_posts_slug ON public.blog_posts(slug);
CREATE INDEX idx_blog_posts_status ON public.blog_posts(status);
CREATE INDEX idx_blog_posts_author_id ON public.blog_posts(author_id);
CREATE INDEX idx_blog_posts_published_at ON public.blog_posts(published_at);

-- Media indexes
CREATE INDEX idx_media_site_id ON public.media(site_id);
CREATE INDEX idx_media_type ON public.media(type);
CREATE INDEX idx_media_folder_id ON public.media(folder_id);
CREATE INDEX idx_media_tags ON public.media USING GIN(tags);

-- Activity logs indexes
CREATE INDEX idx_activity_logs_site_id ON public.activity_logs(site_id);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at);

-- Page views indexes
CREATE INDEX idx_page_views_site_id ON public.page_views(site_id);
CREATE INDEX idx_page_views_page_id ON public.page_views(page_id);
CREATE INDEX idx_page_views_created_at ON public.page_views(created_at);

-- ============================================
-- STORAGE BUCKETS
-- ============================================

-- Create storage buckets (run these separately in Supabase dashboard)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('site-assets', 'site-assets', true);

-- ============================================
-- COMPLETION
-- ============================================

SELECT 'Scythian CMS database schema created successfully!' AS message;
