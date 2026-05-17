import type { Site, SiteWebhookEventKind } from '@backy-cms/core';
import { trackWebhookEvent } from '@/lib/backyStore';
import { recordRepositoryInteractionEvent } from '@/lib/commentRepositorySupport';
import type { getRequiredDatabaseRepositories } from '@/lib/repositoryRuntime';

type SiteWebhookRepositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
type SiteWebhookDeliveryStatus = 'queued' | 'succeeded' | 'failed';
type DeliverableSite = Pick<Site, 'id' | 'name' | 'slug'> & Partial<Pick<Site, 'settings' | 'customDomain' | 'isPublished'>> & {
  status?: string | null;
};

const DELIVERY_TIMEOUT_MS = 5000;

const isValidWebhookUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

async function recordSiteWebhookEvent(params: {
  repositories?: SiteWebhookRepositories | null;
  kind: SiteWebhookEventKind;
  siteId: string;
  target: string;
  status: SiteWebhookDeliveryStatus;
  requestId: string;
  actor?: string | null;
  reason?: string | null;
  statusCode?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}) {
  const event = {
    kind: params.kind,
    siteId: params.siteId,
    target: params.target,
    status: params.status,
    statusCode: params.statusCode,
    requestId: params.requestId,
    actor: params.actor || undefined,
    reason: params.reason || params.kind,
    error: params.error,
    metadata: {
      channel: 'site-webhook',
      ...(params.metadata || {}),
    },
  };

  if (params.repositories) {
    await recordRepositoryInteractionEvent(params.repositories, event);
    return;
  }

  trackWebhookEvent(event);
}

export async function deliverSiteWebhooks(params: {
  repositories?: SiteWebhookRepositories | null;
  site: DeliverableSite;
  kind: SiteWebhookEventKind;
  requestId: string;
  actor?: string | null;
  reason?: string | null;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const webhooks = params.site.settings?.webhooks;
  const eventBase = {
    repositories: params.repositories,
    kind: params.kind,
    siteId: params.site.id,
    requestId: params.requestId,
    actor: params.actor,
    reason: params.reason,
  };
  const endpoints = webhooks?.enabled === true
    ? (webhooks.endpoints || []).filter((endpoint) => (
        endpoint.enabled !== false &&
        endpoint.eventKinds.includes(params.kind) &&
        isValidWebhookUrl(endpoint.url)
      ))
    : [];

  if (!endpoints.length) {
    return [];
  }

  return Promise.all(endpoints.map(async (endpoint) => {
    const metadata = {
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      endpointEventKinds: endpoint.eventKinds,
      ...(endpoint.secretId ? { secretId: endpoint.secretId } : {}),
      ...(params.metadata || {}),
    };

    await recordSiteWebhookEvent({
      ...eventBase,
      target: endpoint.url,
      status: 'queued',
      metadata,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-backy-site-id': params.site.id,
          'x-backy-site-webhook-event': params.kind,
          'x-backy-request-id': params.requestId,
          'x-backy-webhook-endpoint-id': endpoint.id,
          ...(endpoint.headers || {}),
        },
        body: JSON.stringify({
          schemaVersion: 'backy.site-webhook.v1',
          kind: params.kind,
          siteId: params.site.id,
          site: {
            id: params.site.id,
            name: params.site.name,
            slug: params.site.slug,
            status: params.site.status || (params.site.isPublished ? 'published' : 'draft'),
            customDomain: params.site.customDomain || null,
          },
          requestId: params.requestId,
          reason: params.reason || params.kind,
          actor: params.actor || null,
          data: params.data || {},
        }),
      });

      await recordSiteWebhookEvent({
        ...eventBase,
        target: endpoint.url,
        status: response.ok ? 'succeeded' : 'failed',
        statusCode: response.status,
        error: response.ok ? undefined : `Webhook returned ${response.status}`,
        metadata,
      });

      return {
        endpointId: endpoint.id,
        target: endpoint.url,
        status: response.ok ? 'succeeded' as const : 'failed' as const,
        statusCode: response.status,
        error: response.ok ? undefined : `Webhook returned ${response.status}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown webhook error';
      await recordSiteWebhookEvent({
        ...eventBase,
        target: endpoint.url,
        status: 'failed',
        error: message,
        metadata,
      });

      return {
        endpointId: endpoint.id,
        target: endpoint.url,
        status: 'failed' as const,
        error: message,
      };
    } finally {
      clearTimeout(timeout);
    }
  }));
}
