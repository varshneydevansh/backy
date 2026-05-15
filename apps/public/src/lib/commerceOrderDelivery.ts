import { getAdminSettings, trackWebhookEvent } from '@/lib/backyStore';
import { recordRepositoryInteractionEvent } from '@/lib/commentRepositorySupport';
import {
  buildCommerceOrderNotificationEmail,
  EmailDeliveryError,
  getEmailDeliveryConfig,
  sendEmailMessage,
} from '@/lib/formEmailDelivery';
import { getRequiredDatabaseRepositories } from '@/lib/repositoryRuntime';

type CommerceRepositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
type CommerceOrderDeliveryStatus = 'queued' | 'succeeded' | 'failed';
type CommerceOrderDeliveryResult =
  | Awaited<ReturnType<typeof deliverCommerceOrderWebhook>>
  | Awaited<ReturnType<typeof deliverCommerceOrderEmail>>;

export interface CommerceOrderNotificationOrder {
  id: string;
  slug?: string;
  orderNumber: string;
  total: number;
  currency: string;
  customerName?: string;
  email?: string;
  itemCount?: number;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  checkoutSessionId?: string;
}

const readRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const readString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const readBoolean = (value: unknown, fallback = false): boolean => (
  typeof value === 'boolean' ? value : fallback
);

const readNotificationSettings = async (repositories?: CommerceRepositories | null): Promise<Record<string, unknown>> => {
  if (repositories) {
    const settings = await repositories.settings.get();
    return readRecord(readRecord(settings.integrations).notifications);
  }

  return readRecord(readRecord(getAdminSettings().integrations).notifications);
};

const resolveNotificationEmailRecipient = (email: Record<string, unknown>): string => (
  readString(email.recipient) ||
  readString(email.to) ||
  readString(email.adminEmail) ||
  readString(process.env.BACKY_ORDER_NOTIFICATION_EMAIL) ||
  readString(process.env.BACKY_NOTIFICATION_EMAIL_TO) ||
  readString(process.env.BACKY_ADMIN_NOTIFICATION_EMAIL)
);

async function recordCommerceOrderDeliveryEvent(params: {
  repositories?: CommerceRepositories | null;
  siteId: string;
  order: CommerceOrderNotificationOrder;
  target: string;
  status: CommerceOrderDeliveryStatus;
  requestId: string;
  statusCode?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}) {
  const event = {
    kind: 'commerce-order' as const,
    siteId: params.siteId,
    target: params.target,
    status: params.status,
    statusCode: params.statusCode,
    requestId: params.requestId,
    actor: 'commerce-order-intake',
    error: params.error,
    metadata: {
      orderId: params.order.id,
      orderSlug: params.order.slug || '',
      orderNumber: params.order.orderNumber,
      total: params.order.total,
      currency: params.order.currency,
      itemCount: params.order.itemCount || 0,
      customerName: params.order.customerName || '',
      email: params.order.email || '',
      paymentStatus: params.order.paymentStatus || 'pending',
      fulfillmentStatus: params.order.fulfillmentStatus || 'unfulfilled',
      checkoutSessionId: params.order.checkoutSessionId || '',
      ...(params.metadata || {}),
    },
  };

  if (params.repositories) {
    await recordRepositoryInteractionEvent(params.repositories, event);
    return;
  }

  trackWebhookEvent(event);
}

async function deliverCommerceOrderWebhook(params: {
  repositories?: CommerceRepositories | null;
  siteId: string;
  order: CommerceOrderNotificationOrder;
  target: string;
  requestId: string;
}) {
  await recordCommerceOrderDeliveryEvent({
    ...params,
    status: 'queued',
    metadata: { channel: 'webhook' },
  });

  try {
    const response = await fetch(params.target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backy-site-id': params.siteId,
        'x-backy-order-id': params.order.id,
        'x-backy-order-event': 'commerce-order',
      },
      body: JSON.stringify({
        kind: 'commerce-order',
        siteId: params.siteId,
        order: params.order,
        requestId: params.requestId,
      }),
    });

    await recordCommerceOrderDeliveryEvent({
      ...params,
      status: response.ok ? 'succeeded' : 'failed',
      statusCode: response.status,
      error: response.ok ? undefined : `Webhook returned ${response.status}`,
      metadata: { channel: 'webhook' },
    });

    return {
      attempted: true as const,
      channel: 'webhook' as const,
      target: params.target,
      status: response.ok ? 'succeeded' as const : 'failed' as const,
      statusCode: response.status,
      error: response.ok ? undefined : `Webhook returned ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook error';
    await recordCommerceOrderDeliveryEvent({
      ...params,
      status: 'failed',
      error: message,
      metadata: { channel: 'webhook' },
    });

    return {
      attempted: true as const,
      channel: 'webhook' as const,
      target: params.target,
      status: 'failed' as const,
      error: message,
    };
  }
}

async function deliverCommerceOrderEmail(params: {
  repositories?: CommerceRepositories | null;
  siteId: string;
  order: CommerceOrderNotificationOrder;
  target: string;
  requestId: string;
}) {
  const config = getEmailDeliveryConfig();
  const message = buildCommerceOrderNotificationEmail({
    config,
    siteId: params.siteId,
    order: params.order,
    requestId: params.requestId,
    to: params.target,
  });

  await recordCommerceOrderDeliveryEvent({
    ...params,
    target: `mailto:${params.target}`,
    status: 'queued',
    metadata: {
      channel: 'email',
      provider: config.provider,
      from: config.from,
      subject: message.subject,
    },
  });

  try {
    const result = await sendEmailMessage(config, message);
    await recordCommerceOrderDeliveryEvent({
      ...params,
      target: `mailto:${params.target}`,
      status: 'succeeded',
      statusCode: result.statusCode,
      metadata: {
        channel: 'email',
        provider: config.provider,
        from: config.from,
        subject: message.subject,
        ...(result.metadata || {}),
      },
    });

    return {
      attempted: true as const,
      channel: 'email' as const,
      target: `mailto:${params.target}`,
      status: 'succeeded' as const,
      statusCode: result.statusCode,
      provider: config.provider,
      metadata: result.metadata,
    };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Unknown email delivery error';
    await recordCommerceOrderDeliveryEvent({
      ...params,
      target: `mailto:${params.target}`,
      status: 'failed',
      statusCode: error instanceof EmailDeliveryError ? error.statusCode : undefined,
      error: messageText,
      metadata: {
        channel: 'email',
        provider: config.provider,
        from: config.from,
        subject: message.subject,
        ...(error instanceof EmailDeliveryError ? error.metadata || {} : {}),
      },
    });

    return {
      attempted: true as const,
      channel: 'email' as const,
      target: `mailto:${params.target}`,
      status: 'failed' as const,
      statusCode: error instanceof EmailDeliveryError ? error.statusCode : undefined,
      provider: config.provider,
      error: messageText,
    };
  }
}

export async function notifyCommerceOrderCreated(params: {
  repositories?: CommerceRepositories | null;
  siteId: string;
  order: CommerceOrderNotificationOrder;
  requestId: string;
}) {
  const notifications = await readNotificationSettings(params.repositories);
  const digestFrequency = readString(notifications.digestFrequency);
  if (digestFrequency === 'off') {
    return [];
  }

  const deliveries: CommerceOrderDeliveryResult[] = [];
  const webhookUrl = readString(notifications.webhookUrl);
  const email = readRecord(notifications.email);
  const orderEmailEnabled = readBoolean(email.orderCreated, false) || readBoolean(email.commerceOrders, false);
  const recipient = resolveNotificationEmailRecipient(email);

  if (webhookUrl) {
    deliveries.push(await deliverCommerceOrderWebhook({
      ...params,
      target: webhookUrl,
    }));
  }

  if (orderEmailEnabled && recipient) {
    deliveries.push(await deliverCommerceOrderEmail({
      ...params,
      target: recipient,
    }));
  }

  return deliveries;
}
