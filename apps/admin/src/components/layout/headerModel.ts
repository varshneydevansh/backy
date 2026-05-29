import {
  ClipboardList,
  Globe2,
  MessageSquare,
  ShoppingBag,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AdminAuditLog, AdminUserPermissionMatrix, SiteSettingsInput } from '@/lib/adminContentApi';
import {
  canAccessAdminNavigationArea,
  type AdminNavigationArea,
} from '@/lib/adminNavigationAccess';
import type { User } from '@/stores/authStore';

export type StaticToolRoute =
  | '/'
  | '/sites'
  | '/pages'
  | '/blog'
  | '/forms'
  | '/comments'
  | '/contacts'
  | '/media'
  | '/products'
  | '/orders'
  | '/collections'
  | '/reusable-sections'
  | '/teams'
  | '/users'
  | '/help'
  | '/settings';

export type SearchResult =
  | { id: string; type: 'Site'; title: string; detail: string; action: { route: 'site'; siteId: string } }
  | { id: string; type: 'Page'; title: string; detail: string; action: { route: 'page'; pageId: string } }
  | { id: string; type: 'Blog'; title: string; detail: string; action: { route: 'blog'; postId: string } }
  | { id: string; type: 'Form'; title: string; detail: string; action: { route: 'forms' } }
  | { id: string; type: 'Comment'; title: string; detail: string; action: { route: 'comments' } }
  | { id: string; type: 'Contact'; title: string; detail: string; action: { route: 'contacts' } }
  | { id: string; type: 'Media'; title: string; detail: string; action: { route: 'media'; assetId: string } }
  | { id: string; type: 'Collection'; title: string; detail: string; action: { route: 'collection'; collectionId: string } }
  | { id: string; type: 'Record'; title: string; detail: string; action: { route: 'collectionRecord'; collectionId: string; recordId: string } }
  | { id: string; type: 'Product'; title: string; detail: string; action: { route: 'product'; productId: string } }
  | { id: string; type: 'Order'; title: string; detail: string; action: { route: 'order'; orderId: string } }
  | { id: string; type: 'User'; title: string; detail: string; action: { route: 'user'; userId: string } }
  | { id: string; type: 'Tool'; title: string; detail: string; action: { route: 'static'; to: StaticToolRoute } };

export type WorkflowNotificationTone = 'warning' | 'danger' | 'success' | 'info';

export interface WorkflowNotification {
  id: string;
  tone: WorkflowNotificationTone;
  title: string;
  detail: string;
  meta: string;
  actionLabel: string;
  action:
    | { route: 'comments' }
    | { route: 'forms' }
    | { route: 'contacts' }
    | { route: 'orders' }
    | { route: 'site'; siteId: string }
    | { route: 'dashboard' }
    | { route: 'settings' };
}

export interface WorkflowShortcut {
  id: string;
  label: string;
  detail: string;
  count: number;
  to: StaticToolRoute;
  icon: LucideIcon;
}

export const STATIC_ROUTE_AREA: Record<StaticToolRoute, AdminNavigationArea> = {
  '/': 'dashboard',
  '/sites': 'sites',
  '/pages': 'pages',
  '/blog': 'blog',
  '/forms': 'forms',
  '/comments': 'comments',
  '/contacts': 'contacts',
  '/media': 'media',
  '/products': 'commerce',
  '/orders': 'commerce',
  '/collections': 'collections',
  '/reusable-sections': 'sections',
  '/teams': 'teams',
  '/users': 'users',
  '/help': 'help',
  '/settings': 'settings',
};

export const notificationToneClasses: Record<WorkflowNotificationTone, string> = {
  danger: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
};

export const commentsNotificationsEnabled = (settings?: SiteSettingsInput): boolean => (
  settings?.integrations?.notifications?.inApp?.comments !== false
);

export const activityNotificationsEnabled = (settings?: SiteSettingsInput): boolean => (
  settings?.integrations?.notifications?.inApp?.activity !== false
);

export const readRecordValue = (values: Record<string, unknown>, key: string, fallback = '') => (
  values[key] ?? values[key.toLowerCase()] ?? values[key.replace(/([A-Z])/g, '').toLowerCase()] ?? fallback
);

export const auditNotificationTitle = (log: AdminAuditLog): string => {
  const action = log.action
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return action || 'Backend activity recorded';
};

export const auditNotificationDetail = (log: AdminAuditLog): string => {
  const entity = log.entity.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const actor = log.actorId ? ` by ${log.actorId}` : '';
  return `${entity || 'record'} ${log.entityId || 'updated'}${actor}`;
};

export const getHeaderPageTitle = (path: string) => {
  if (path === '/') return 'Dashboard';
  if (path.startsWith('/sites')) return 'Sites';
  if (path.startsWith('/pages')) return 'Pages';
  if (path.startsWith('/blog')) return 'Blog';
  if (path.startsWith('/collections')) return 'Collections';
  if (path.startsWith('/reusable-sections')) return 'Sections';
  if (path.startsWith('/forms')) return 'Forms';
  if (path.startsWith('/media')) return 'Media';
  if (path.startsWith('/products')) return 'Products';
  if (path.startsWith('/orders')) return 'Orders';
  if (path.startsWith('/comments')) return 'Comments';
  if (path.startsWith('/contacts')) return 'Contacts';
  if (path.startsWith('/teams')) return 'Teams';
  if (path.startsWith('/users')) return 'Users';
  if (path.startsWith('/help')) return 'Help';
  if (path.startsWith('/settings')) return 'Settings';
  return 'Dashboard';
};

interface BuildWorkflowShortcutsOptions {
  commentsAlertsDisabled: boolean;
  pendingCommentCount: number;
  permissionMatrix: AdminUserPermissionMatrix | null;
  user: User | null;
  workflowNotifications: WorkflowNotification[];
}

export const buildWorkflowShortcuts = ({
  commentsAlertsDisabled,
  pendingCommentCount,
  permissionMatrix,
  user,
  workflowNotifications,
}: BuildWorkflowShortcutsOptions): WorkflowShortcut[] => {
  const routeCount = (route: WorkflowNotification['action']['route']) => (
    workflowNotifications.filter((notification) => notification.action.route === route).length
  );

  const shortcuts: WorkflowShortcut[] = [
    {
      id: 'comments',
      label: 'Comments',
      detail: commentsAlertsDisabled ? 'Alerts off' : 'Moderation',
      count: pendingCommentCount,
      to: '/comments',
      icon: MessageSquare,
    },
    {
      id: 'forms',
      label: 'Forms',
      detail: 'Submissions',
      count: routeCount('forms'),
      to: '/forms',
      icon: ClipboardList,
    },
    {
      id: 'contacts',
      label: 'Contacts',
      detail: 'Leads',
      count: routeCount('contacts'),
      to: '/contacts',
      icon: Users,
    },
    {
      id: 'orders',
      label: 'Orders',
      detail: 'Fulfillment',
      count: routeCount('orders'),
      to: '/orders',
      icon: ShoppingBag,
    },
    {
      id: 'site',
      label: 'Site',
      detail: 'Readiness',
      count: routeCount('site'),
      to: '/sites',
      icon: Globe2,
    },
    {
      id: 'activity',
      label: 'Activity',
      detail: 'Audit trail',
      count: routeCount('dashboard'),
      to: '/',
      icon: ClipboardList,
    },
    {
      id: 'settings',
      label: 'Settings',
      detail: 'Notifications',
      count: commentsAlertsDisabled ? 1 : routeCount('settings'),
      to: '/settings',
      icon: SlidersHorizontal,
    },
  ];

  return shortcuts.filter((shortcut) => (
    canAccessAdminNavigationArea(permissionMatrix, user, STATIC_ROUTE_AREA[shortcut.to])
  ));
};
