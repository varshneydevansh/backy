/**
 * ============================================================================
 * BACKY CMS - HEADER COMPONENT
 * ============================================================================
 *
 * The top header bar with search, notifications, and user menu.
 *
 * @module Header
 * @author Backy CMS Team
 * @license MIT
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  Search,
  Bell,
  Menu,
  User,
  Settings,
  LogOut,
  ChevronDown,
  MessageSquare,
  CheckCircle2,
  CircleSlash,
  RefreshCw,
  ShieldAlert,
  Globe2,
  X,
} from 'lucide-react';
import { cn, getRelativeTime } from '@/lib/utils';
import {
  canAccessAdminNavigationArea,
  useCurrentAdminPermissionMatrix,
  type AdminNavigationArea,
} from '@/lib/adminNavigationAccess';
import { getSiteSelectionFromSearch, getSiteSwitchTarget, siteMatchesIdentifier } from '@/lib/siteSelection';
import { useAuthStore } from '@/stores/authStore';
import { useStore } from '@/stores/mockStore';
import {
  getSettings,
  listBlogPosts,
  listAdminAuditLogs,
  listComments,
  listCollections,
  listCollectionRecords,
  listFormContacts,
  listForms,
  getFormWithSubmissions,
  getSiteReadiness,
  listPages,
  listSites,
  updateComments,
  type AdminContact,
  type AdminComment,
  type FormDefinition,
  type FormSubmission,
} from '@/lib/adminContentApi';
import { listMedia } from '@/lib/mediaApi';
import {
  STATIC_ROUTE_AREA,
  activityNotificationsEnabled,
  auditNotificationDetail,
  auditNotificationTitle,
  buildWorkflowShortcuts,
  commentsNotificationsEnabled,
  getHeaderPageTitle,
  notificationToneClasses,
  readRecordValue,
  type SearchResult,
  type StaticToolRoute,
  type WorkflowNotification,
  type WorkflowShortcut,
} from './headerModel';

// ============================================
// TYPES
// ============================================

interface HeaderProps {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  onSidebarToggle: () => void;
}

interface FormSubmissionNotification {
  form: FormDefinition;
  submission: FormSubmission;
}

interface ContactNotification {
  form: FormDefinition;
  contact: AdminContact;
}

// ============================================
// COMPONENT
// ============================================

export function Header({ mobileSidebarOpen, onSidebarToggle }: HeaderProps) {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { user, signOut } = useAuthStore();
  const { permissionMatrix } = useCurrentAdminPermissionMatrix(user);
  const sites = useStore((state) => state.sites);
  const storeUsers = useStore((state) => state.users);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pendingComments, setPendingComments] = useState<AdminComment[]>([]);
  const [workflowNotifications, setWorkflowNotifications] = useState<WorkflowNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [notificationsNotice, setNotificationsNotice] = useState<string | null>(null);
  const [notificationsLoadedForSiteId, setNotificationsLoadedForSiteId] = useState<string | null>(null);
  const [commentsAlertsDisabled, setCommentsAlertsDisabled] = useState(false);
  const [updatingCommentIds, setUpdatingCommentIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIndex, setSearchIndex] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLoadedForSiteId, setSearchLoadedForSiteId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchInFlightRef = useRef<string | null>(null);
  const latestSearchLoadKeyRef = useRef<string>('');
  const isGlobalSearchBusy = searchLoading;

  const selectedSiteId = getSiteSelectionFromSearch(sites);
  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const activeSiteName = activeSite?.name || activeSiteId;
  const activeSiteMeta = activeSite?.customDomain || activeSite?.slug || activeSiteId;
  const activeSiteStatus = activeSite?.status || 'draft';
  const activeSiteRouteId = useMemo(
    () => activeSite?.id || activeSiteId,
    [activeSite?.id, activeSiteId],
  );
  const activeSiteDetailHref = `/sites/${encodeURIComponent(activeSiteRouteId)}`;
  const activeSiteDomainState = activeSite?.customDomain ? 'custom-domain' : 'managed-host';
  const activeSiteDomainLabel = activeSite?.customDomain
    ? `Custom domain: ${activeSite.customDomain}`
    : `Managed Backy host: ${activeSite?.slug || activeSiteId}.backy.app`;
  const activeSiteSearch = useMemo(() => ({ siteId: activeSiteId }), [activeSiteId]);
  const profileUser = useMemo(
    () => {
      if (!user) return undefined;

      return (
        storeUsers.find((member) => member.id === user.id) ||
        storeUsers.find((member) => member.email.toLowerCase() === user.email.toLowerCase())
      );
    },
    [storeUsers, user],
  );
  const profileRouteUserId = user?.id || profileUser?.id || '';
  const notificationCount = pendingComments.length + workflowNotifications.length;
  const isNotificationMutationBusy = updatingCommentIds.length > 0;
  const isNotificationCenterBusy = notificationsLoading || isNotificationMutationBusy;
  const notificationsLoadedForActiveSite = notificationsLoadedForSiteId === activeSiteId;
  const canAccessArea = useCallback((area: AdminNavigationArea) => (
    canAccessAdminNavigationArea(permissionMatrix, user, area)
  ), [permissionMatrix, user]);
  const searchLoadKey = useMemo(() => (
    `${activeSiteId}:${permissionMatrix ? `${permissionMatrix.summary.allowed}/${permissionMatrix.summary.total}` : user?.role || 'anonymous'}`
  ), [activeSiteId, permissionMatrix, user?.role]);
  const searchHydrationStatus = searchLoading
    ? 'loading'
    : searchError
      ? 'error'
      : searchLoadedForSiteId === searchLoadKey
        ? 'ready'
        : 'idle';
  const workflowShortcuts = useMemo<WorkflowShortcut[]>(() => buildWorkflowShortcuts({
    commentsAlertsDisabled,
    pendingCommentCount: pendingComments.length,
    permissionMatrix,
    user,
    workflowNotifications,
  }), [commentsAlertsDisabled, pendingComments.length, permissionMatrix, user, workflowNotifications]);
  const searchResults = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (normalizedQuery.length < 2) return searchIndex.slice(0, 6);

    return searchIndex
      .filter((item) => [
        item.title,
        item.detail,
        item.type,
      ].some((value) => value.toLowerCase().includes(normalizedQuery)))
      .slice(0, 8);
  }, [searchIndex, searchQuery]);
  const searchActionStatusId = 'header-global-search-action-status';
  const searchDisabledReason = searchLoading
    ? 'Search results are loading.'
    : searchError
      ? 'Search results could not load.'
      : '';
  const searchActionState = searchDisabledReason ? 'blocked' : 'ready';
  const searchQueryLabel = searchQuery.trim()
    ? `for "${searchQuery.trim()}"`
    : 'from suggested tools and content';
  const searchActionStatus = searchDisabledReason
    ? `Search unavailable: ${searchDisabledReason} Result actions unavailable: ${searchDisabledReason}`
    : `${searchResults.length} search result${searchResults.length === 1 ? '' : 's'} available ${searchQueryLabel}. Result actions available.`;
  const mobileNavigationStatusId = 'header-mobile-navigation-status';
  const mobileNavigationStatus = mobileSidebarOpen
    ? 'Admin navigation is open. Close navigation available from the mobile navigation panel.'
    : 'Admin navigation is closed. Open admin navigation available.';
  const clearGlobalSearch = useCallback(() => {
    setSearchQuery('');
    setSearchOpen(true);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  const pageTitle = getHeaderPageTitle(routerState.location.pathname);

  const handleSignOut = () => {
    signOut();
    setUserMenuOpen(false);
    navigate({ to: '/login' });
  };

  const switchActiveSite = (nextSiteId: string) => {
    const target = getSiteSwitchTarget({
      pathname: routerState.location.pathname,
      search: routerState.location.search as Record<string, unknown>,
      requestedSiteId: nextSiteId,
      sites,
    });

    setSearchOpen(false);
    setSearchQuery('');
    setNotificationsOpen(false);
    setUserMenuOpen(false);

    switch (target.type) {
      case 'siteDetail':
        navigate({ to: '/sites/$siteId', params: { siteId: target.siteId } });
        return;
      case 'sites':
        navigate({ to: '/sites', search: { siteId: target.siteId } });
        return;
      case 'pagesNew':
        navigate({ to: '/pages/new', search: { siteId: target.siteId } });
        return;
      case 'pages':
        navigate({ to: '/pages', search: { siteId: target.siteId } });
        return;
      case 'blogNew':
        navigate({ to: '/blog/new', search: { siteId: target.siteId } });
        return;
      case 'blog':
        navigate({ to: '/blog', search: { siteId: target.siteId } });
        return;
      case 'media':
        navigate({ to: '/media', search: { siteId: target.siteId } });
        return;
      case 'collections':
        navigate({ to: '/collections', search: { siteId: target.siteId } });
        return;
      case 'reusableSections':
        navigate({ to: '/reusable-sections', search: { siteId: target.siteId } });
        return;
      case 'products':
        navigate({ to: '/products', search: { siteId: target.siteId } });
        return;
      case 'orders':
        navigate({ to: '/orders', search: { siteId: target.siteId } });
        return;
      case 'forms':
        navigate({ to: '/forms', search: { siteId: target.siteId } });
        return;
      case 'newsletter':
        navigate({ to: '/newsletter', search: { siteId: target.siteId } });
        return;
      case 'contacts':
        navigate({ to: '/contacts', search: { siteId: target.siteId } });
        return;
      case 'comments':
        navigate({ to: '/comments', search: { siteId: target.siteId } });
        return;
      case 'teams':
        navigate({ to: '/teams', search: { siteId: target.siteId } });
        return;
      case 'users':
        navigate({ to: '/users', search: { siteId: target.siteId } });
        return;
      case 'help':
        navigate({ to: '/help', search: { siteId: target.siteId } });
        return;
      case 'settings':
        navigate({
          to: '/settings',
          search: {
            siteId: target.siteId,
            ...(target.tab ? { tab: target.tab } : {}),
          },
        });
        return;
      case 'dashboard':
        navigate({ to: '/', search: { siteId: target.siteId } });
        return;
      default:
        return;
    }
  };

  const navigateToTool = (to: StaticToolRoute) => {
    if (to === '/') {
      navigate({ to: '/', search: activeSiteSearch });
      return;
    }

    if (to === '/forms') {
      navigate({ to: '/forms', search: activeSiteSearch });
      return;
    }

    if (to === '/pages') {
      navigate({ to: '/pages', search: activeSiteSearch });
      return;
    }

    if (to === '/blog') {
      navigate({ to: '/blog', search: activeSiteSearch });
      return;
    }

    if (to === '/comments') {
      navigate({ to: '/comments', search: activeSiteSearch });
      return;
    }

    if (to === '/contacts') {
      navigate({ to: '/contacts', search: activeSiteSearch });
      return;
    }

    if (to === '/newsletter') {
      navigate({ to: '/newsletter', search: activeSiteSearch });
      return;
    }

    if (to === '/media') {
      navigate({ to: '/media', search: activeSiteSearch });
      return;
    }

    if (to === '/products') {
      navigate({ to: '/products', search: activeSiteSearch });
      return;
    }

    if (to === '/orders') {
      navigate({ to: '/orders', search: activeSiteSearch });
      return;
    }

    if (to === '/collections') {
      navigate({ to: '/collections', search: activeSiteSearch });
      return;
    }

    if (to === '/reusable-sections') {
      navigate({ to: '/reusable-sections', search: activeSiteSearch });
      return;
    }

    if (to === '/users') {
      navigate({ to: '/users', search: activeSiteSearch });
      return;
    }

    if (to === '/help') {
      navigate({ to: '/help', search: activeSiteSearch });
      return;
    }

    navigate({ to });
  };

  const navigateToWorkflowShortcut = (shortcut: WorkflowShortcut) => {
    if (isNotificationCenterBusy) return;

    setNotificationsOpen(false);

    if (shortcut.id === 'settings') {
      navigate({ to: '/settings', search: { tab: 'notifications' } });
      return;
    }

    if (shortcut.id === 'site') {
      navigate({ to: '/sites/$siteId', params: { siteId: activeSiteRouteId } });
      return;
    }

    navigateToTool(shortcut.to);
  };

  const openNotificationSettings = () => {
    if (isNotificationCenterBusy) return;

    setNotificationsOpen(false);
    navigate({ to: '/settings', search: { tab: 'notifications' } });
  };

  const loadNotifications = async () => {
    if (isNotificationCenterBusy) return;

    setNotificationsLoading(true);
    setNotificationsError(null);
    setNotificationsNotice(null);

    try {
      const settings = await getSettings().catch(() => undefined);
      const commentsEnabled = commentsNotificationsEnabled(settings);
      const activityEnabled = activityNotificationsEnabled(settings);
      setCommentsAlertsDisabled(!commentsEnabled);

      const [commentResult, forms, readiness, collections, auditResult] = await Promise.all([
        commentsEnabled
          ? listComments(activeSiteId, { status: 'pending', limit: 5, sort: 'newest' }).catch(() => ({ comments: [] }))
          : Promise.resolve({ comments: [] }),
        listForms(activeSiteId).catch(() => []),
        getSiteReadiness(activeSiteId).catch(() => null),
        listCollections(activeSiteId).catch(() => []),
        activityEnabled
          ? listAdminAuditLogs({ limit: 3 }).catch(() => ({ logs: [] }))
          : Promise.resolve({ logs: [] }),
      ]);

      const formWork = await Promise.all(
        forms.slice(0, 6).map(async (form) => {
          const [submissionsResult, contactsResult] = await Promise.all([
            getFormWithSubmissions(activeSiteId, form.id, { status: 'pending', limit: 3 }).catch(() => null),
            listFormContacts(activeSiteId, form.id, { status: 'new', limit: 3 }).catch(() => ({ contacts: [] })),
          ]);

          return {
            form,
            submissions: submissionsResult?.submissions.data || [],
            contacts: contactsResult.contacts || [],
          };
        }),
      );

      const ordersCollection = collections.find((collection) => collection.slug === 'orders');
      const orderRecords = ordersCollection
        ? await listCollectionRecords(activeSiteId, ordersCollection.id, { limit: 100 }).then((result) => result.records).catch(() => [])
        : [];

      const pendingSubmissions: FormSubmissionNotification[] = formWork.flatMap((entry) => (
        entry.submissions.map((submission) => ({ form: entry.form, submission }))
      ));
      const newContacts: ContactNotification[] = formWork.flatMap((entry) => (
        entry.contacts.map((contact) => ({ form: entry.form, contact }))
      ));
      const paidUnfulfilledOrders = orderRecords.filter((record) => {
        const paymentStatus = String(readRecordValue(record.values, 'paymentstatus', '')).toLowerCase();
        const fulfillmentStatus = String(readRecordValue(record.values, 'fulfillmentstatus', '')).toLowerCase();
        return paymentStatus === 'paid' && fulfillmentStatus !== 'fulfilled' && fulfillmentStatus !== 'cancelled';
      });

      const nextWorkflowNotifications: WorkflowNotification[] = [
        ...(readiness && (readiness.summary.errors > 0 || readiness.summary.warnings > 0) ? [{
          id: `site-readiness:${activeSiteId}`,
          tone: readiness.summary.errors > 0 ? 'danger' as const : 'warning' as const,
          title: readiness.summary.errors > 0 ? 'Publishing is blocked' : 'Publishing needs review',
          detail: `${readiness.summary.errors} errors and ${readiness.summary.warnings} warnings found in site readiness.`,
          meta: `${readiness.score}% ready`,
          actionLabel: 'Open site',
          action: { route: 'site' as const, siteId: activeSiteRouteId },
        }] : []),
        ...(auditResult.logs || []).slice(0, 3).map((log) => ({
          id: `activity:${log.id}`,
          tone: 'info' as const,
          title: auditNotificationTitle(log),
          detail: auditNotificationDetail(log),
          meta: getRelativeTime(log.createdAt),
          actionLabel: 'Open activity',
          action: { route: 'dashboard' as const },
        })),
        ...pendingSubmissions.slice(0, 4).map(({ form, submission }) => ({
          id: `form-submission:${submission.id}`,
          tone: 'warning' as const,
          title: `${form.title || form.name || 'Form'} submission pending`,
          detail: submission.requestId ? `Request ${submission.requestId}` : 'Review, approve, reject, or mark this submission as spam.',
          meta: getRelativeTime(submission.submittedAt),
          actionLabel: 'Open forms',
          action: { route: 'forms' as const },
        })),
        ...newContacts.slice(0, 4).map(({ form, contact }) => ({
          id: `contact:${contact.id}`,
          tone: 'info' as const,
          title: contact.name || contact.email || 'New lead captured',
          detail: `${form.title || form.name || 'Form'} lead is waiting in Contacts.`,
          meta: getRelativeTime(contact.createdAt || contact.updatedAt || new Date().toISOString()),
          actionLabel: 'Open contacts',
          action: { route: 'contacts' as const },
        })),
        ...(paidUnfulfilledOrders.length > 0 ? [{
          id: 'orders:fulfillment',
          tone: 'warning' as const,
          title: `${paidUnfulfilledOrders.length} paid order${paidUnfulfilledOrders.length === 1 ? '' : 's'} need fulfillment`,
          detail: 'Move paid orders through processing, tracking, and fulfilled states.',
          meta: 'Commerce',
          actionLabel: 'Open orders',
          action: { route: 'orders' as const },
        }] : []),
      ].slice(0, 10);

      setPendingComments(commentResult.comments);
      setWorkflowNotifications(nextWorkflowNotifications);
      setNotificationsLoadedForSiteId(activeSiteId);
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : 'Unable to load notifications');
    } finally {
      setNotificationsLoading(false);
    }
  };

  const moderateNotificationComment = async (
    comment: AdminComment,
    status: 'approved' | 'spam',
  ) => {
    if (notificationsLoading || updatingCommentIds.includes(comment.id)) return;

    setUpdatingCommentIds((current) => [...current, comment.id]);
    setNotificationsError(null);
    setNotificationsNotice(null);

    try {
      await updateComments(activeSiteId, {
        commentIds: [comment.id],
        status,
        reviewedBy: user?.id || 'admin',
        actor: user?.id || 'admin',
        ...(status === 'spam' ? { rejectionReason: 'Marked as spam from notifications.' } : {}),
      });
      setPendingComments((current) => current.filter((item) => item.id !== comment.id));
      setNotificationsNotice(status === 'approved' ? 'Comment approved.' : 'Comment marked as spam.');
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : 'Unable to update comment');
    } finally {
      setUpdatingCommentIds((current) => current.filter((id) => id !== comment.id));
    }
  };

  const handleWorkflowNotification = (notification: WorkflowNotification) => {
    if (isNotificationCenterBusy) return;

    setNotificationsOpen(false);

    if (notification.action.route === 'comments') {
      navigate({ to: '/comments', search: activeSiteSearch });
      return;
    }
    if (notification.action.route === 'forms') {
      navigate({ to: '/forms', search: activeSiteSearch });
      return;
    }
    if (notification.action.route === 'contacts') {
      navigate({ to: '/contacts', search: activeSiteSearch });
      return;
    }
    if (notification.action.route === 'orders') {
      navigate({ to: '/orders', search: activeSiteSearch });
      return;
    }
    if (notification.action.route === 'site') {
      navigate({ to: '/sites/$siteId', params: { siteId: notification.action.siteId } });
      return;
    }
    if (notification.action.route === 'dashboard') {
      navigate({ to: '/', search: activeSiteSearch });
      return;
    }
    openNotificationSettings();
  };

  const openNotificationSummaryTarget = () => {
    if (isNotificationCenterBusy) return;

    setNotificationsOpen(false);

    if (pendingComments.length > 0) {
      navigate({ to: '/comments', search: activeSiteSearch });
      return;
    }

    if (workflowNotifications[0]) {
      handleWorkflowNotification(workflowNotifications[0]);
      return;
    }

    if (commentsAlertsDisabled) {
      openNotificationSettings();
      return;
    }

    navigate({ to: '/', search: activeSiteSearch });
  };

  const notificationSummaryLabel = pendingComments.length > 0
    ? 'Open moderation queue'
      : workflowNotifications[0]
        ? workflowNotifications[0].actionLabel
      : commentsAlertsDisabled
        ? 'Open notification settings'
      : 'Open dashboard';
  const notificationPanelState = notificationsLoading
    ? 'loading'
    : notificationsError
      ? 'error'
      : pendingComments.length === 0 && workflowNotifications.length === 0
        ? 'empty'
        : 'ready';
  const notificationActionStatusId = 'header-notification-action-status';
  const notificationDisabledReason = notificationsLoading
    ? 'Notifications are loading.'
    : isNotificationMutationBusy
      ? 'A notification action is running.'
      : '';
  const notificationActionState = notificationDisabledReason ? 'blocked' : 'ready';
  const notificationActionStatus = notificationDisabledReason
    ? `Refresh unavailable: ${notificationDisabledReason} Workflow shortcuts unavailable: ${notificationDisabledReason} Summary action unavailable: ${notificationDisabledReason}`
    : `${notificationCount} active notification${notificationCount === 1 ? '' : 's'}. Refresh available. Workflow shortcuts available. ${notificationSummaryLabel} available.`;
  const accountMenuId = 'header-account-menu';
  const accountActionStatusId = 'header-account-action-status';
  const accountDisplayName = user?.fullName || user?.email || 'Guest';
  const accountActionStatus = user
    ? `Profile available. Settings available. Sign out available for ${accountDisplayName}.`
    : 'Profile available. Settings available. Sign out unavailable: No signed-in admin session.';
  const siteSwitchStatusId = 'header-site-switcher-status';
  const siteSwitchStatus = `${activeSiteName} is active. Switch site from this control without signing out.`;
  const siteDomainStatus = `Open domain and subdomain setup for ${activeSiteName}. ${activeSiteDomainLabel}.`;

  const loadGlobalSearch = useCallback(async () => {
    const loadKey = searchLoadKey;
    if (searchInFlightRef.current === loadKey || searchLoadedForSiteId === loadKey) return;

    if (!latestSearchLoadKeyRef.current) {
      latestSearchLoadKeyRef.current = loadKey;
    }
    searchInFlightRef.current = loadKey;
    setSearchLoading(true);
    setSearchError(null);

    try {
      const canViewSites = canAccessArea('sites');
      const canViewPages = canAccessArea('pages');
      const canViewBlog = canAccessArea('blog');
      const canViewForms = canAccessArea('forms');
      const canViewComments = canAccessArea('comments');
      const canViewContacts = canAccessArea('contacts');
      const canViewMedia = canAccessArea('media');
      const canViewCollections = canAccessArea('collections');
      const canViewCommerce = canAccessArea('commerce');
      const canViewUsers = canAccessArea('users');
      const [loadedSites, pages, posts, forms, comments, mediaAssets, collections] = await Promise.all([
        canViewSites ? listSites().catch(() => []) : Promise.resolve([]),
        canViewPages ? listPages(activeSiteId).catch(() => []) : Promise.resolve([]),
        canViewBlog ? listBlogPosts(activeSiteId).catch(() => []) : Promise.resolve([]),
        canViewForms ? listForms(activeSiteId).catch(() => []) : Promise.resolve([]),
        canViewComments ? listComments(activeSiteId, { status: 'all', limit: 20, sort: 'newest' }).then((result) => result.comments).catch(() => []) : Promise.resolve([]),
        canViewMedia ? listMedia({ siteId: activeSiteId, limit: 20 }).catch(() => []) : Promise.resolve([]),
        canViewCollections || canViewCommerce ? listCollections(activeSiteId).catch(() => []) : Promise.resolve([]),
      ]);
      const productsCollection = collections.find((collection) => collection.slug === 'products');
      const ordersCollection = collections.find((collection) => collection.slug === 'orders');
      const customCollections = collections.filter((collection) => (
        collection.slug !== 'products' && collection.slug !== 'orders'
      ));
      const contactGroups = await Promise.all(
        canViewContacts
          ? forms.map((form) => listFormContacts(activeSiteId, form.id, { limit: 20 }).then((result) => result.contacts).catch(() => []))
          : [],
      );
      const [productRecords, orderRecords] = await Promise.all([
        productsCollection && canViewCommerce
          ? listCollectionRecords(activeSiteId, productsCollection.id, { limit: 20, sortBy: 'updatedAt', sortDirection: 'desc' })
            .then((result) => result.records)
            .catch(() => [])
          : Promise.resolve([]),
        ordersCollection && canViewCommerce
          ? listCollectionRecords(activeSiteId, ordersCollection.id, { limit: 20, sortBy: 'updatedAt', sortDirection: 'desc' })
            .then((result) => result.records)
            .catch(() => [])
          : Promise.resolve([]),
      ]);
      const customCollectionRecords = await Promise.all(
        canViewCollections ? customCollections.slice(0, 4).map(async (collection) => ({
          collection,
          records: await listCollectionRecords(activeSiteId, collection.id, { limit: 8, sortBy: 'updatedAt', sortDirection: 'desc' })
            .then((result) => result.records)
            .catch(() => []),
        })) : [],
      );

      const nextSearchIndex: SearchResult[] = [
        ...loadedSites.map((site) => ({
          id: `site:${site.id}`,
          type: 'Site' as const,
          title: site.name || site.slug || site.id,
          detail: site.slug ? `/${site.slug}` : 'Site settings',
          action: { route: 'site' as const, siteId: site.id },
        })),
        ...pages.map((page) => ({
          id: `page:${page.id}`,
          type: 'Page' as const,
          title: page.title || page.slug || page.id,
          detail: page.slug ? `/${page.slug}` : 'Page editor',
          action: { route: 'page' as const, pageId: page.id },
        })),
        ...posts.map((post) => ({
          id: `blog:${post.id}`,
          type: 'Blog' as const,
          title: post.title || post.slug || post.id,
          detail: post.slug ? `/blog/${post.slug}` : 'Blog editor',
          action: { route: 'blog' as const, postId: post.id },
        })),
        ...forms.map((form) => ({
          id: `form:${form.id}`,
          type: 'Form' as const,
          title: form.title || form.name || form.id,
          detail: `${form.fields.length} fields`,
          action: { route: 'forms' as const },
        })),
        ...comments.map((comment) => ({
          id: `comment:${comment.id}`,
          type: 'Comment' as const,
          title: comment.authorName || 'Anonymous comment',
          detail: comment.content,
          action: { route: 'comments' as const },
        })),
        ...contactGroups.flat().map((contact) => ({
          id: `contact:${contact.id}`,
          type: 'Contact' as const,
          title: contact.name || contact.email || 'Unnamed contact',
          detail: contact.email || contact.notes || contact.status,
          action: { route: 'contacts' as const },
        })),
        ...mediaAssets.map((asset) => {
          const tags = asset.tags || [];

          return {
            id: `media:${asset.id}`,
            type: 'Media' as const,
            title: asset.name || asset.id,
            detail: [
              asset.type,
              asset.size,
              asset.visibility,
              tags.slice(0, 2).join(', '),
            ].filter(Boolean).join(' - '),
            action: { route: 'media' as const, assetId: asset.id },
          };
        }),
        ...customCollections.map((collection) => ({
          id: `collection:${collection.id}`,
          type: 'Collection' as const,
          title: collection.name || collection.slug || collection.id,
          detail: `${collection.fields.length} fields - ${collection.status}`,
          action: { route: 'collection' as const, collectionId: collection.id },
        })),
        ...customCollectionRecords.flatMap(({ collection, records }) => (
          records.map((record) => {
            const nameFallback = String(readRecordValue(record.values, 'name', record.slug) || record.slug);
            const title = String(
              readRecordValue(record.values, 'title', nameFallback) || nameFallback
            );
            const preview = Object.entries(record.values)
              .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
              .slice(0, 2)
              .map(([key, value]) => `${key}: ${String(value).slice(0, 40)}`)
              .join(' - ');

            return {
              id: `collection-record:${collection.id}:${record.id}`,
              type: 'Record' as const,
              title,
              detail: [collection.name || collection.slug, record.status, preview].filter(Boolean).join(' - '),
              action: { route: 'collectionRecord' as const, collectionId: collection.id, recordId: record.id },
            };
          })
        )),
        ...productRecords.map((product) => {
          const title = String(readRecordValue(product.values, 'title', product.slug) || product.slug);
          const sku = String(readRecordValue(product.values, 'sku', '') || '').trim();
          const price = readRecordValue(product.values, 'price', '');
          const currency = String(readRecordValue(product.values, 'currency', 'USD') || 'USD');

          return {
            id: `product:${product.id}`,
            type: 'Product' as const,
            title,
            detail: [
              sku ? `SKU ${sku}` : null,
              price !== '' ? `${currency} ${price}` : null,
              product.status,
            ].filter(Boolean).join(' - '),
            action: { route: 'product' as const, productId: product.id },
          };
        }),
        ...orderRecords.map((order) => {
          const orderNumber = String(readRecordValue(order.values, 'ordernumber', order.slug) || order.slug);
          const customer = String(readRecordValue(order.values, 'customername', '') || '').trim();
          const payment = String(readRecordValue(order.values, 'paymentstatus', '') || '').trim();
          const fulfillment = String(readRecordValue(order.values, 'fulfillmentstatus', '') || '').trim();

          return {
            id: `order:${order.id}`,
            type: 'Order' as const,
            title: orderNumber,
            detail: [
              customer || 'Customer',
              payment || 'payment unknown',
              fulfillment || 'fulfillment unknown',
            ].join(' - '),
            action: { route: 'order' as const, orderId: order.id },
          };
        }),
        ...(canViewUsers ? storeUsers.map((member) => ({
          id: `user:${member.id}`,
          type: 'User' as const,
          title: member.fullName || member.email || member.id,
          detail: `${member.role} - ${member.status}`,
          action: { route: 'user' as const, userId: member.id },
        })) : []),
        ...([
          { id: 'tool:sites', type: 'Tool' as const, title: 'Sites', detail: 'Site settings, readiness, routing, domains', action: { route: 'static' as const, to: '/sites' as const } },
          { id: 'tool:pages', type: 'Tool' as const, title: 'Pages', detail: 'Page tree, drafts, publishing', action: { route: 'static' as const, to: '/pages' as const } },
          { id: 'tool:blog', type: 'Tool' as const, title: 'Blog', detail: 'Posts, categories, authors', action: { route: 'static' as const, to: '/blog' as const } },
          { id: 'tool:forms', type: 'Tool' as const, title: 'Forms', detail: 'Registration, contact, submissions', action: { route: 'static' as const, to: '/forms' as const } },
          { id: 'tool:newsletter', type: 'Tool' as const, title: 'Newsletter', detail: 'Subscribers, signup forms, consent, exports', action: { route: 'static' as const, to: '/newsletter' as const } },
          { id: 'tool:comments', type: 'Tool' as const, title: 'Comments', detail: 'Moderation queue and public replies', action: { route: 'static' as const, to: '/comments' as const } },
          { id: 'tool:contacts', type: 'Tool' as const, title: 'Contacts', detail: 'Captured leads and audience records', action: { route: 'static' as const, to: '/contacts' as const } },
          { id: 'tool:media', type: 'Tool' as const, title: 'Media Library', detail: 'Files, folders, images, fonts', action: { route: 'static' as const, to: '/media' as const } },
          { id: 'tool:products', type: 'Tool' as const, title: 'Products', detail: 'Catalog and sellable items', action: { route: 'static' as const, to: '/products' as const } },
          { id: 'tool:orders', type: 'Tool' as const, title: 'Orders', detail: 'Sales and fulfillment queue', action: { route: 'static' as const, to: '/orders' as const } },
          { id: 'tool:collections', type: 'Tool' as const, title: 'Collections', detail: 'Schemas, records, dynamic data', action: { route: 'static' as const, to: '/collections' as const } },
          { id: 'tool:sections', type: 'Tool' as const, title: 'Sections', detail: 'Reusable page sections', action: { route: 'static' as const, to: '/reusable-sections' as const } },
          { id: 'tool:teams', type: 'Tool' as const, title: 'Teams', detail: 'Workspace teams and member roles', action: { route: 'static' as const, to: '/teams' as const } },
          { id: 'tool:users', type: 'Tool' as const, title: 'Users', detail: 'Admins, roles, invites, membership handoff', action: { route: 'static' as const, to: '/users' as const } },
          { id: 'tool:help', type: 'Tool' as const, title: 'Help', detail: 'Searchable guide for sites, domains, editor, APIs, and roles', action: { route: 'static' as const, to: '/help' as const } },
          { id: 'tool:settings', type: 'Tool' as const, title: 'Settings', detail: 'API keys, infrastructure, delivery mode', action: { route: 'static' as const, to: '/settings' as const } },
        ].filter((tool) => canAccessArea(STATIC_ROUTE_AREA[tool.action.to]))),
      ];

      if (latestSearchLoadKeyRef.current !== loadKey) return;

      setSearchIndex(nextSearchIndex);
      setSearchLoadedForSiteId(loadKey);
    } catch (error) {
      if (latestSearchLoadKeyRef.current === loadKey) {
        setSearchError(error instanceof Error ? error.message : 'Unable to load search');
      }
    } finally {
      if (searchInFlightRef.current === loadKey) {
        searchInFlightRef.current = null;
      }
      if (latestSearchLoadKeyRef.current === loadKey) {
        setSearchLoading(false);
      }
    }
  }, [activeSiteId, canAccessArea, searchLoadKey, searchLoadedForSiteId, storeUsers]);

  const openGlobalSearch = useCallback(() => {
    setSearchOpen(true);
    setNotificationsOpen(false);
    setUserMenuOpen(false);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
    void loadGlobalSearch();
  }, [loadGlobalSearch]);

  const closeGlobalSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const toggleMobileNavigation = () => {
    setSearchOpen(false);
    setNotificationsOpen(false);
    setUserMenuOpen(false);
    onSidebarToggle();
  };

  const toggleNotifications = () => {
    const shouldOpen = !notificationsOpen;
    setNotificationsOpen(shouldOpen);

    if (shouldOpen) {
      setSearchOpen(false);
      setUserMenuOpen(false);
      if (!isNotificationCenterBusy && !notificationsLoadedForActiveSite) void loadNotifications();
    }
  };

  const toggleAccountMenu = () => {
    const shouldOpen = !userMenuOpen;
    setUserMenuOpen(shouldOpen);

    if (shouldOpen) {
      setSearchOpen(false);
      setNotificationsOpen(false);
    }
  };

  const handleSearchResult = (result: SearchResult) => {
    if (isGlobalSearchBusy) return;

    closeGlobalSearch();

    if (result.action.route === 'site') {
      navigate({ to: '/sites/$siteId', params: { siteId: result.action.siteId } });
      return;
    }
    if (result.action.route === 'page') {
      navigate({ to: '/pages/$pageId/edit', params: { pageId: result.action.pageId }, search: activeSiteSearch });
      return;
    }
    if (result.action.route === 'blog') {
      navigate({ to: '/blog/$postId', params: { postId: result.action.postId }, search: activeSiteSearch });
      return;
    }
    if (result.action.route === 'forms') {
      navigate({ to: '/forms', search: activeSiteSearch });
      return;
    }
    if (result.action.route === 'comments') {
      navigate({ to: '/comments', search: activeSiteSearch });
      return;
    }
    if (result.action.route === 'contacts') {
      navigate({ to: '/contacts', search: activeSiteSearch });
      return;
    }
    if (result.action.route === 'media') {
      navigate({ to: '/media', search: { siteId: activeSiteId, assetId: result.action.assetId } });
      return;
    }
    if (result.action.route === 'collection') {
      navigate({ to: '/collections', search: { siteId: activeSiteId, collectionId: result.action.collectionId } });
      return;
    }
    if (result.action.route === 'collectionRecord') {
      navigate({
        to: '/collections',
        search: {
          siteId: activeSiteId,
          collectionId: result.action.collectionId,
          recordId: result.action.recordId,
        },
      });
      return;
    }
    if (result.action.route === 'product') {
      navigate({ to: '/products', search: { siteId: activeSiteId, productId: result.action.productId } });
      return;
    }
    if (result.action.route === 'order') {
      navigate({ to: '/orders', search: { siteId: activeSiteId, orderId: result.action.orderId } });
      return;
    }
    if (result.action.route === 'user') {
      navigate({ to: '/users/$userId', params: { userId: result.action.userId } });
      return;
    }
    navigateToTool(result.action.to);
  };

  useEffect(() => {
    setNotificationsOpen(false);
    setPendingComments([]);
    setWorkflowNotifications([]);
    setNotificationsError(null);
    setNotificationsNotice(null);
    setCommentsAlertsDisabled(false);
    setNotificationsLoadedForSiteId(null);
  }, [activeSiteId]);

  useEffect(() => {
    latestSearchLoadKeyRef.current = searchLoadKey;
    searchInFlightRef.current = null;
    setSearchIndex([]);
    setSearchError(null);
    setSearchLoadedForSiteId(null);
    setSearchLoading(false);
  }, [searchLoadKey]);

  useEffect(() => {
    if (!searchOpen || searchLoading || searchError || searchLoadedForSiteId === searchLoadKey) return;

    void loadGlobalSearch();
  }, [loadGlobalSearch, searchError, searchLoadedForSiteId, searchLoadKey, searchLoading, searchOpen]);

  useEffect(() => {
    const handleSettingsSaved = () => {
      if (notificationsOpen || notificationsLoadedForActiveSite) {
        void loadNotifications();
      } else {
        setNotificationsLoadedForSiteId(null);
      }
    };

    window.addEventListener('backy:settings-saved', handleSettingsSaved);
    return () => {
      window.removeEventListener('backy:settings-saved', handleSettingsSaved);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, notificationsLoadedForActiveSite, notificationsOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      const key = event.key.toLowerCase();
      const editorCommandSurfaceActive = Boolean(
        document.querySelector('[data-testid="editor-shell-layout"], [data-testid="editor-command-palette"]'),
      );

      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        if (editorCommandSurfaceActive) {
          return;
        }
        event.preventDefault();
        openGlobalSearch();
        return;
      }

      if (!isTypingTarget && event.key === '/') {
        event.preventDefault();
        openGlobalSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openGlobalSearch]);

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:px-6">
      {/* Left Section */}
      <div className="flex min-w-0 items-center gap-3">
        <span id={mobileNavigationStatusId} className="sr-only" data-testid="header-mobile-navigation-status">
          {mobileNavigationStatus}
        </span>
        <button
          type="button"
          onClick={toggleMobileNavigation}
          className="rounded-lg p-2 hover:bg-accent focus-ring lg:hidden"
          aria-label="Open admin navigation"
          aria-controls="admin-mobile-sidebar-navigation"
          aria-expanded={mobileSidebarOpen}
          aria-describedby={mobileNavigationStatusId}
          data-action-state="ready"
          data-action-status={mobileNavigationStatus}
          data-testid="header-mobile-navigation-toggle"
        >
          <Menu className="w-5 h-5" />
        </button>

        <h1 className="hidden shrink-0 text-lg font-semibold sm:block">
          {pageTitle}
        </h1>
        {sites.length > 0 && (
          <div
            className="hidden min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 shadow-sm lg:flex"
            data-testid="header-site-switcher-shell"
            data-active-site-id={activeSiteId}
            data-active-site-name={activeSiteName}
            data-active-site-meta={activeSiteMeta}
            data-active-site-status={activeSiteStatus}
            data-active-site-domain-state={activeSiteDomainState}
            data-active-site-domain-label={activeSiteDomainLabel}
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-md',
                activeSiteStatus === 'published'
                  ? 'bg-success/10 text-success'
                  : 'bg-muted text-muted-foreground',
              )}
              aria-hidden="true"
            >
              <Globe2 className="size-3.5" />
            </span>
            <div className="min-w-0">
              <label htmlFor="header-site-switcher" className="block text-[10px] font-semibold uppercase leading-3 tracking-wide text-muted-foreground">
                Site
              </label>
              <span id={siteSwitchStatusId} className="sr-only" data-testid="header-site-switcher-status">
                {siteSwitchStatus}
              </span>
              <div className="relative">
                <select
                  id="header-site-switcher"
                  value={activeSiteId}
                  onChange={(event) => switchActiveSite(event.target.value)}
                  aria-describedby={siteSwitchStatusId}
                  className="h-8 w-48 appearance-none truncate bg-transparent pr-6 text-sm font-semibold text-foreground outline-none hover:text-primary focus:text-primary xl:w-56"
                  data-testid="header-site-switcher"
                  data-action-state="ready"
                  data-action-status={siteSwitchStatus}
                >
                  {sites.map((site) => {
                    const optionSiteId = site.publicSiteId || site.id;
                    const optionMeta = site.customDomain || site.slug || optionSiteId;

                    return (
                      <option key={site.id} value={optionSiteId}>
                        {site.name} / {optionMeta}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="pointer-events-none absolute right-0 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              </div>
            </div>
            <a
              href={`${activeSiteDetailHref}#site-domain`}
              aria-label={siteDomainStatus}
              title={siteDomainStatus}
              className="inline-flex min-h-8 shrink-0 items-center rounded-md border border-border px-2 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground focus-ring"
              data-testid="header-active-site-domains"
              data-target-site-id={activeSiteRouteId}
              data-active-site-id={activeSiteId}
              data-active-site-domain-state={activeSiteDomainState}
              data-action-state="ready"
              data-action-status={siteDomainStatus}
            >
              Domains
            </a>
          </div>
        )}
      </div>

      {/* Right Section */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Search */}
        <button
          type="button"
          onClick={openGlobalSearch}
          disabled={isGlobalSearchBusy}
          className="inline-flex rounded-lg p-2 transition-colors hover:bg-accent focus-ring disabled:cursor-not-allowed disabled:opacity-60 md:hidden"
          aria-label="Open search"
          aria-describedby={searchActionStatusId}
          data-action-state={searchActionState}
          data-action-status={searchActionStatus}
          data-disabled-reason={searchDisabledReason || undefined}
          data-testid="header-global-search-mobile-toggle"
        >
          <Search className="h-5 w-5" />
        </button>
        <div className={cn(
          'relative items-center',
          searchOpen
            ? 'fixed inset-x-3 top-3 z-40 flex md:static md:z-auto'
            : 'hidden md:flex',
        )}
          data-search-hydration={searchHydrationStatus}
          data-action-state={searchActionState}
          data-action-status={searchActionStatus}
        >
          <span id={searchActionStatusId} className="sr-only" data-testid="header-global-search-action-status">
            {searchActionStatus}
          </span>
          <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search..."
            value={searchQuery}
            aria-label="Search Backy"
            aria-describedby={searchActionStatusId}
            data-testid="header-global-search-input"
            onFocus={openGlobalSearch}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setSearchOpen(true);
              void loadGlobalSearch();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setSearchOpen(false);
                return;
              }
              if (event.key === 'Enter' && searchResults[0] && !isGlobalSearchBusy) {
                event.preventDefault();
                handleSearchResult(searchResults[0]);
              }
            }}
            className={cn(
              'pl-9 pr-20 py-2 rounded-lg bg-muted text-sm',
              'focus:outline-none focus:ring-2 focus:ring-ring',
              'w-full shadow-lg md:w-48 md:shadow-none lg:w-64 transition-all'
            )}
          />
          {searchQuery ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearGlobalSearch}
              className="absolute right-2 rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground focus-ring"
              aria-label="Clear search"
              aria-describedby={searchActionStatusId}
              data-action-state="ready"
              data-action-status={searchActionStatus}
              data-testid="header-global-search-clear"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2 hidden rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:block">
              / or cmd K
            </kbd>
          )}
          {searchOpen && (
            <div
              className="fixed left-3 right-3 top-14 z-40 overflow-hidden rounded-lg border border-border bg-card shadow-lg md:absolute md:left-0 md:right-auto md:top-full md:mt-2 md:w-[22rem]"
              aria-describedby={searchActionStatusId}
              data-action-state={searchActionState}
              data-action-status={searchActionStatus}
              data-testid="header-global-search-popover"
            >
              <div className="border-b border-border px-4 py-3">
                <div className="text-sm font-semibold">Search Backy</div>
                <div className="text-xs text-muted-foreground">Sites, pages, posts, forms, contacts, and tools.</div>
              </div>
              <div className="max-h-96 overflow-y-auto p-2">
                {searchLoading ? (
                  <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                    Loading...
                  </div>
                ) : searchError ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <div>{searchError}</div>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void loadGlobalSearch()}
                      disabled={isGlobalSearchBusy}
                      aria-describedby={searchActionStatusId}
                      data-action-state={searchActionState}
                      data-action-status={searchActionStatus}
                      data-disabled-reason={searchDisabledReason || undefined}
                      data-testid="header-global-search-error-retry"
                      className="mt-2 inline-flex rounded-md border border-amber-300 bg-white/70 px-2 py-1 text-xs font-medium text-amber-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Retry search
                    </button>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div
                    className="rounded-md border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground"
                    role="status"
                    data-testid="header-global-search-empty"
                    data-empty-query={searchQuery.trim()}
                  >
                    <div className="font-medium text-foreground">No results for "{searchQuery.trim()}"</div>
                    <div className="mx-auto mt-1 max-w-64 text-xs">
                      Clear search to return to suggested tools and content.
                    </div>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={clearGlobalSearch}
                      aria-describedby={searchActionStatusId}
                      data-action-state="ready"
                      data-action-status={searchActionStatus}
                      className="mt-3 inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent focus-ring"
                      data-testid="header-global-search-empty-clear"
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  searchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      disabled={isGlobalSearchBusy}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSearchResult(result)}
                      aria-describedby={searchActionStatusId}
                      data-action-state={searchActionState}
                      data-action-status={searchActionStatus}
                      data-disabled-reason={searchDisabledReason || undefined}
                      data-search-result-id={result.id}
                      data-search-result-type={result.type}
                      data-testid={`header-global-search-result-${result.id}`}
                      className="block w-full rounded-md px-3 py-2 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium">{result.title}</span>
                        <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {result.type}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{result.detail}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative">
          <span id={notificationActionStatusId} className="sr-only" data-testid="header-notification-action-status">
            {notificationActionStatus}
          </span>
          <button
            type="button"
            aria-label={`${notificationCount} pending notifications`}
            aria-expanded={notificationsOpen}
            aria-haspopup="dialog"
            aria-describedby={notificationActionStatusId}
            data-action-state={notificationActionState}
            data-action-status={notificationActionStatus}
            data-disabled-reason={notificationDisabledReason || undefined}
            data-testid="header-notification-toggle"
            onClick={toggleNotifications}
            className={cn(
              'relative rounded-lg p-2 transition-colors hover:bg-accent focus-ring',
              notificationsOpen && 'bg-accent text-accent-foreground',
            )}
          >
            <Bell className="w-5 h-5" />
            {notificationCount > 0 && (
              <span className="absolute right-1 top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
                {Math.min(9, notificationCount)}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <>
              <div
                className="fixed inset-x-0 bottom-0 top-16 z-10"
                onClick={() => setNotificationsOpen(false)}
              />
              <div
                className="absolute right-0 top-full z-20 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl"
                data-testid="header-notification-panel"
                data-notification-state={notificationPanelState}
                data-notification-count={notificationCount}
                data-notification-site-id={activeSiteId}
                data-action-state={notificationActionState}
                data-action-status={notificationActionStatus}
                role="dialog"
                aria-label="Notification center"
                aria-describedby={notificationActionStatusId}
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      Notification center
                      {notificationCount > 0 && (
                        <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
                          {notificationCount} active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">Moderation, leads, forms, orders, activity, and readiness for this site.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadNotifications()}
                    disabled={isNotificationCenterBusy}
                    aria-describedby={notificationActionStatusId}
                    data-action-state={notificationActionState}
                    data-action-status={notificationActionStatus}
                    data-disabled-reason={notificationDisabledReason || undefined}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="header-notification-refresh"
                  >
                    <RefreshCw className={cn('size-3', notificationsLoading && 'animate-spin')} />
                    Refresh
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 border-b border-border bg-muted/30 p-3">
                  {workflowShortcuts.map((shortcut) => {
                    const ShortcutIcon = shortcut.icon;
                    return (
                      <button
                        key={shortcut.id}
                        type="button"
                        onClick={() => navigateToWorkflowShortcut(shortcut)}
                        disabled={isNotificationCenterBusy}
                        aria-describedby={notificationActionStatusId}
                        data-action-state={notificationActionState}
                        data-action-status={notificationActionStatus}
                        data-disabled-reason={notificationDisabledReason || undefined}
                        className="group rounded-lg border border-border bg-background px-2.5 py-2 text-left transition hover:border-primary/40 hover:bg-primary/5 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                        data-testid={`header-notification-shortcut-${shortcut.id}`}
                        data-shortcut-count={shortcut.count}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-primary">
                            <ShortcutIcon className="size-3.5" />
                          </span>
                          <span className={cn(
                            'inline-flex min-w-5 justify-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                            shortcut.count > 0
                              ? 'bg-red-50 text-red-700'
                              : 'bg-muted text-muted-foreground',
                          )}>
                            {shortcut.count}
                          </span>
                        </div>
                        <div className="mt-2 truncate text-xs font-semibold">{shortcut.label}</div>
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{shortcut.detail}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {notificationsLoading ? (
                    <div className="space-y-2 p-2">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="rounded-lg border border-border p-3">
                          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                          <div className="mt-3 h-3 w-full animate-pulse rounded bg-muted" />
                          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-muted" />
                        </div>
                      ))}
                    </div>
                  ) : notificationsError ? (
                    <div
                      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900"
                      role="alert"
                      data-testid="header-notification-error"
                    >
                      <div className="font-medium">Notifications could not load</div>
                      <p className="mt-1 leading-6">{notificationsError}</p>
                      <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                        <button
                          type="button"
                          onClick={() => void loadNotifications()}
                          disabled={isNotificationCenterBusy}
                          aria-describedby={notificationActionStatusId}
                          data-action-state={notificationActionState}
                          data-action-status={notificationActionStatus}
                          data-disabled-reason={notificationDisabledReason || undefined}
                          className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-white/70 px-3 text-xs font-medium text-amber-900 transition hover:bg-white focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                          data-testid="header-notification-error-retry"
                        >
                          <RefreshCw className={cn('size-3.5', notificationsLoading && 'animate-spin')} />
                          Retry
                        </button>
                        <button
                          type="button"
                          onClick={openNotificationSettings}
                          disabled={isNotificationCenterBusy}
                          aria-describedby={notificationActionStatusId}
                          data-action-state={notificationActionState}
                          data-action-status={notificationActionStatus}
                          data-disabled-reason={notificationDisabledReason || undefined}
                          className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-white/70 px-3 text-xs font-medium text-amber-900 transition hover:bg-white focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                          data-testid="header-notification-error-settings"
                        >
                          <Settings className="size-3.5" />
                          Notification settings
                        </button>
                      </div>
                    </div>
                  ) : pendingComments.length === 0 && workflowNotifications.length === 0 ? (
                    <div
                      className="rounded-lg border border-dashed border-border px-4 py-6 text-center"
                      role="status"
                      data-testid="header-notification-empty"
                    >
                      <CheckCircle2 className="mx-auto size-5 text-success" />
                      <p className="mt-2 text-sm font-medium">No active notifications</p>
                      <p className="mt-1 text-xs text-muted-foreground">New moderation, lead, order, activity, and readiness tasks will appear here.</p>
                      {commentsAlertsDisabled && (
                        <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                          <ShieldAlert className="size-3" />
                          Comment alerts are off in Settings.
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => void loadNotifications()}
                          disabled={isNotificationCenterBusy}
                          aria-describedby={notificationActionStatusId}
                          data-action-state={notificationActionState}
                          data-action-status={notificationActionStatus}
                          data-disabled-reason={notificationDisabledReason || undefined}
                          className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-accent focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                          data-testid="header-notification-empty-refresh"
                        >
                          <RefreshCw className={cn('size-3.5', notificationsLoading && 'animate-spin')} />
                          Refresh
                        </button>
                        <button
                          type="button"
                          onClick={openNotificationSettings}
                          disabled={isNotificationCenterBusy}
                          aria-describedby={notificationActionStatusId}
                          data-action-state={notificationActionState}
                          data-action-status={notificationActionStatus}
                          data-disabled-reason={notificationDisabledReason || undefined}
                          className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-accent focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                          data-testid="header-notification-empty-settings"
                        >
                          <Settings className="size-3.5" />
                          Settings
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {notificationsNotice && (
                        <div className="rounded-md border border-success/20 bg-success/10 px-3 py-2 text-xs font-medium text-success">
                          {notificationsNotice}
                        </div>
                      )}
                      {commentsAlertsDisabled && (
                        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                          <span>Comment alerts are off in Settings. Other backend notifications are still shown.</span>
                        </div>
                      )}
                      {workflowNotifications.map((notification) => (
                        <article key={notification.id} className="rounded-lg border border-border bg-background p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={cn('rounded-md border px-1.5 py-0.5 text-[11px] font-semibold', notificationToneClasses[notification.tone])}>
                                  {notification.meta}
                                </span>
                                <h3 className="line-clamp-2 text-sm font-semibold leading-5">{notification.title}</h3>
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                {notification.detail}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleWorkflowNotification(notification)}
                              disabled={isNotificationCenterBusy}
                              aria-describedby={notificationActionStatusId}
                              data-action-state={notificationActionState}
                              data-action-status={notificationActionStatus}
                              data-disabled-reason={notificationDisabledReason || undefined}
                              data-testid={`header-notification-workflow-action-${notification.id}`}
                              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {notification.actionLabel}
                            </button>
                          </div>
                        </article>
                      ))}
                      {pendingComments.map((comment) => {
                        const isUpdating = updatingCommentIds.includes(comment.id);
                        const commentActionDisabledReason = isUpdating
                          ? 'This comment action is running.'
                          : notificationsLoading
                            ? 'Notifications are loading.'
                            : '';
                        const commentActionState = commentActionDisabledReason ? 'blocked' : 'ready';
                        const commentActionStatus = commentActionDisabledReason
                          ? `Approve unavailable: ${commentActionDisabledReason} Spam unavailable: ${commentActionDisabledReason}`
                          : 'Approve available. Spam available.';
                        return (
                          <article key={comment.id} className="rounded-lg border border-border bg-background p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                                  <span className="truncate">{comment.authorName || 'Anonymous'}</span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                  <span className="capitalize">{comment.targetType}</span>
                                  <span>{getRelativeTime(comment.createdAt)}</span>
                                  {(comment.reportCount || 0) > 0 && (
                                    <span className="rounded bg-warning/10 px-1.5 py-0.5 font-medium text-warning">
                                      {comment.reportCount} reports
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isNotificationCenterBusy) return;

                                  setNotificationsOpen(false);
                                  navigate({ to: '/comments', search: activeSiteSearch });
                                }}
                                disabled={isNotificationCenterBusy}
                                aria-describedby={notificationActionStatusId}
                                data-action-state={notificationActionState}
                                data-action-status={notificationActionStatus}
                                data-disabled-reason={notificationDisabledReason || undefined}
                                data-testid={`header-notification-comment-review-${comment.id}`}
                                className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Review
                              </button>
                            </div>
                            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                              {comment.content}
                            </p>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                disabled={isUpdating || notificationsLoading}
                                onClick={() => void moderateNotificationComment(comment, 'approved')}
                                aria-describedby={notificationActionStatusId}
                                data-action-state={commentActionState}
                                data-action-status={commentActionStatus}
                                data-disabled-reason={commentActionDisabledReason || undefined}
                                data-testid={`header-notification-comment-approve-${comment.id}`}
                                className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-success/25 bg-success/10 px-2 text-xs font-medium text-success transition hover:bg-success/15 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <CheckCircle2 className="size-3.5" />
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={isUpdating || notificationsLoading}
                                onClick={() => void moderateNotificationComment(comment, 'spam')}
                                aria-describedby={notificationActionStatusId}
                                data-action-state={commentActionState}
                                data-action-status={commentActionStatus}
                                data-disabled-reason={commentActionDisabledReason || undefined}
                                data-testid={`header-notification-comment-spam-${comment.id}`}
                                className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-destructive/20 bg-destructive/10 px-2 text-xs font-medium text-destructive transition hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <CircleSlash className="size-3.5" />
                                Spam
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={openNotificationSummaryTarget}
                  disabled={isNotificationCenterBusy}
                  aria-describedby={notificationActionStatusId}
                  data-action-state={notificationActionState}
                  data-action-status={notificationActionStatus}
                  data-disabled-reason={notificationDisabledReason || undefined}
                  className="flex w-full items-center justify-center border-t border-border px-4 py-3 text-sm font-medium text-primary hover:bg-accent focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="header-notification-summary-action"
                >
                  {notificationSummaryLabel}
                </button>
              </div>
            </>
          )}
        </div>

        {/* User Menu */}
        <div className="relative">
          <span id={accountActionStatusId} className="sr-only" data-testid="header-account-action-status">
            {accountActionStatus}
          </span>
          <button
            type="button"
            onClick={toggleAccountMenu}
            className="flex items-center gap-2 rounded-lg p-2 hover:bg-accent focus-ring"
            aria-label="Open account menu"
            aria-expanded={userMenuOpen}
            aria-controls={accountMenuId}
            aria-describedby={accountActionStatusId}
            aria-haspopup="menu"
            data-action-state="ready"
            data-action-status={accountActionStatus}
            data-testid="header-account-toggle"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <span className="hidden sm:block text-sm font-medium">
              {user?.fullName || 'Guest'}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>

          {userMenuOpen && (
            <>
              <div
                className="fixed inset-x-0 bottom-0 top-16 z-10"
                onClick={() => setUserMenuOpen(false)}
              />
              <div
                id={accountMenuId}
                className="absolute right-0 top-full z-20 mt-2 w-48 rounded-lg border border-border bg-card py-1 shadow-lg"
                role="menu"
                aria-label="Account"
                aria-describedby={accountActionStatusId}
                data-action-state="ready"
                data-action-status={accountActionStatus}
                data-testid="header-account-menu"
              >
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    if (profileRouteUserId) {
                      navigate({ to: '/users/$userId', params: { userId: profileRouteUserId } });
                      return;
                    }

                    navigate({ to: '/settings' });
                  }}
                  data-testid="header-profile-link"
                  aria-describedby={accountActionStatusId}
                  data-action-state="ready"
                  data-action-status={accountActionStatus}
                  data-profile-user-id={profileRouteUserId}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-accent focus-ring"
                  role="menuitem"
                >
                  <User className="w-4 h-4" />
                  Profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate({ to: '/settings' });
                  }}
                  aria-describedby={accountActionStatusId}
                  data-action-state="ready"
                  data-action-status={accountActionStatus}
                  data-testid="header-account-settings-action"
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-accent focus-ring"
                  role="menuitem"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <hr className="my-1 border-border" />
                <button
                  type="button"
                  onClick={handleSignOut}
                  aria-describedby={accountActionStatusId}
                  data-action-state={user ? 'ready' : 'blocked'}
                  data-action-status={accountActionStatus}
                  data-disabled-reason={user ? undefined : 'No signed-in admin session.'}
                  data-testid="header-account-sign-out-action"
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 focus-ring"
                  role="menuitem"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
