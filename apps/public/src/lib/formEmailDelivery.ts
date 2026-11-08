import net from 'node:net';
import { EmailSenderPolicyError, getEmailSenderPolicySummary, resolveEmailSiteSender } from './emailSenderPolicy';
export { getEmailSenderPolicySummary } from './emailSenderPolicy';
import tls from 'node:tls';
import type { Comment, FormDefinition, FormSubmission } from '@backy-cms/core';
import { getHostingerMailConfig, getHostingerMailConfigurationSummary, HostingerMailError, sendHostingerMailMessage, type HostingerMailConfig } from './hostingerMail';

export type EmailDeliveryProvider = 'local-outbox' | 'http-endpoint' | 'resend' | 'smtp' | 'hostinger';

export interface EmailDeliveryMessage {
  /** Newsletter-only standard unsubscribe headers; arbitrary headers are not admitted. */
  headers?: { 'List-Unsubscribe': string; 'List-Unsubscribe-Post': string };
  to: string;
  from: string;
  subject: string;
  text: string;
  siteId: string;
  formId?: string;
  submissionId?: string;
  commentId?: string;
  orderId?: string;
  userId?: string;
  entityType?: 'form-submission' | 'comment' | 'commerce-order' | 'commerce-product' | 'admin-invite' | 'admin-password-reset';
  status: string;
  requestId: string;
  values?: Record<string, unknown>;
}

export interface EmailDeliveryConfig {
  provider: EmailDeliveryProvider;
  from: string;
  endpoint?: string;
  apiKey?: string;
  hostinger?: HostingerMailConfig;
  senderPolicy?: { siteId: string; source: 'site-mapping' | 'default' };
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
  };
}

export class EmailDeliveryError extends Error {
  statusCode?: number;
  metadata?: Record<string, unknown>;

  constructor(message: string, options: { statusCode?: number; metadata?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'EmailDeliveryError';
    this.statusCode = options.statusCode;
    this.metadata = options.metadata;
  }
}

const readEnv = (...keys: string[]): string => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
};

const readBooleanEnv = (key: string, fallback = false): boolean => {
  const value = process.env[key]?.trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
};

const getEmailFromAddress = () => (
  readEnv('BACKY_EMAIL_FROM', 'BACKY_NOTIFICATION_EMAIL_FROM', 'BACKY_SMTP_FROM', 'BACKY_RESEND_FROM') ||
  'Backy <notifications@backy.local>'
);

const getDefaultEmailDeliveryConfig = (): EmailDeliveryConfig => {
  const providerOverride = readEnv('BACKY_EMAIL_PROVIDER', 'BACKY_TRANSACTIONAL_EMAIL_PROVIDER').toLowerCase();
  const endpoint = readEnv('BACKY_EMAIL_DELIVERY_ENDPOINT', 'BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL');
  const resendApiKey = readEnv('BACKY_RESEND_API_KEY', 'RESEND_API_KEY');
  const resendApiUrl = readEnv('BACKY_RESEND_API_URL') || 'https://api.resend.com/emails';
  const smtpHost = readEnv('BACKY_SMTP_HOST', 'SMTP_HOST');
  const smtpPort = Number.parseInt(readEnv('BACKY_SMTP_PORT', 'SMTP_PORT') || '', 10);
  const from = getEmailFromAddress();

  if (providerOverride === 'local-outbox') {
    return { provider: 'local-outbox', from };
  }

  if (providerOverride === 'hostinger') {
    const hostinger = getHostingerMailConfig();
    return { provider: 'hostinger', from: hostinger.from, hostinger };
  }

  if (providerOverride === 'resend') {
    return { provider: 'resend', from, endpoint: resendApiUrl, apiKey: resendApiKey };
  }

  if (providerOverride === 'smtp') {
    return {
      provider: 'smtp',
      from,
      smtp: {
        host: smtpHost,
        port: Number.isFinite(smtpPort) ? smtpPort : 587,
        secure: readBooleanEnv('BACKY_SMTP_SECURE') || readBooleanEnv('SMTP_SECURE'),
        user: readEnv('BACKY_SMTP_USER', 'SMTP_USER') || undefined,
        password: readEnv('BACKY_SMTP_PASSWORD', 'SMTP_PASSWORD') || undefined,
      },
    };
  }

  if (providerOverride === 'http-endpoint' || providerOverride === 'webhook') {
    return { provider: 'http-endpoint', from, endpoint };
  }

  if (endpoint) {
    return { provider: 'http-endpoint', from, endpoint };
  }

  if (resendApiKey) {
    return { provider: 'resend', from, endpoint: resendApiUrl, apiKey: resendApiKey };
  }

  if (smtpHost) {
    return {
      provider: 'smtp',
      from,
      smtp: {
        host: smtpHost,
        port: Number.isFinite(smtpPort) ? smtpPort : 587,
        secure: readBooleanEnv('BACKY_SMTP_SECURE') || readBooleanEnv('SMTP_SECURE'),
        user: readEnv('BACKY_SMTP_USER', 'SMTP_USER') || undefined,
        password: readEnv('BACKY_SMTP_PASSWORD', 'SMTP_PASSWORD') || undefined,
      },
    };
  }

  return { provider: 'local-outbox', from };
};

export const getEmailDeliveryConfig = (siteId?: string): EmailDeliveryConfig => {
  const config = getDefaultEmailDeliveryConfig();
  if (siteId === undefined) {
    if (!getEmailSenderPolicySummary().configurationValid) throw new EmailDeliveryError('BACKY_EMAIL_SITE_SENDERS must map canonical site IDs to plain sender mailbox addresses.', { statusCode: 503, metadata: { reason: 'invalid-policy' } });
    return config;
  }
  try {
    const selected = resolveEmailSiteSender(siteId, config.from);
    return {
      ...config,
      from: selected.from,
      senderPolicy: { siteId, source: selected.source },
      ...(config.hostinger ? { hostinger: { ...config.hostinger, from: selected.from,
        // Resolve a different authorized mailbox by address through the provider; never reuse another sender's ID.
        mailboxId: selected.from === config.hostinger.from ? config.hostinger.mailboxId : undefined,
      } } : {}),
    };
  } catch (error) {
    if (error instanceof EmailSenderPolicyError) throw new EmailDeliveryError(error.message, { statusCode: 503, metadata: { reason: error.reason } });
    throw new EmailDeliveryError('Site email sender configuration could not be resolved.', { statusCode: 503 });
  }
};

/** Public-safe capability discovery, never addresses, mailbox IDs, tokens or SMTP credentials. */
export const getEmailDeliveryCapabilitySummary = (siteId?: string) => {
  const senderPolicy = getEmailSenderPolicySummary(siteId);
  try {
    const config = getEmailDeliveryConfig(siteId);
    return { provider: config.provider, configured: senderPolicy.configurationValid && isExternalEmailDeliveryConfigured(config), senderPolicy };
  } catch {
    return { provider: 'unknown', configured: false, senderPolicy };
  }
};

export const isExternalEmailDeliveryConfigured = (config: EmailDeliveryConfig): boolean => {
  if (config.provider === 'hostinger') {
    return Boolean(config.hostinger && getHostingerMailConfigurationSummary(config.hostinger).configured);
  }
  if (config.provider === 'http-endpoint') {
    return Boolean(config.endpoint);
  }

  if (config.provider === 'resend') {
    return Boolean(config.apiKey);
  }

  if (config.provider === 'smtp') {
    return Boolean(config.smtp?.host);
  }

  return false;
};

const summarizeValuesForEmail = (values: Record<string, unknown>): string => (
  Object.entries(values)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value ?? '')}`)
    .join('\n')
);

export const buildFormNotificationEmail = (params: {
  config: EmailDeliveryConfig;
  siteId: string;
  form: FormDefinition;
  submission: FormSubmission;
  values: Record<string, unknown>;
  requestId: string;
  to: string;
}): EmailDeliveryMessage => {
  const subject = `New ${params.form.title || params.form.name || 'form'} submission`;
  const text = [
    `Backy received a new form submission for ${params.form.title || params.form.name || params.form.id}.`,
    '',
    `Site: ${params.siteId}`,
    `Form: ${params.form.id}`,
    `Submission: ${params.submission.id}`,
    `Status: ${params.submission.status}`,
    `Request: ${params.requestId}`,
    '',
    summarizeValuesForEmail(params.values),
  ].join('\n');

  return {
    to: params.to,
    from: params.config.from,
    subject,
    text,
    siteId: params.siteId,
    formId: params.form.id,
    submissionId: params.submission.id,
    entityType: 'form-submission',
    status: params.submission.status,
    requestId: params.requestId,
    values: params.submission.values || params.values,
  };
};

export const buildCommentNotificationEmail = (params: {
  config: EmailDeliveryConfig;
  siteId: string;
  comment: Comment;
  eventType: 'comment-submitted' | 'comment-reported' | 'comment-status';
  requestId: string;
  to: string;
  reason?: string;
  actor?: string;
}): EmailDeliveryMessage => {
  const targetLabel = `${params.comment.targetType}:${params.comment.targetId}`;
  const eventLabel = params.eventType === 'comment-submitted'
    ? 'New comment'
    : params.eventType === 'comment-reported'
      ? 'Comment reported'
      : 'Comment moderation update';
  const subject = `${eventLabel} on ${targetLabel}`;
  const text = [
    `Backy recorded a comment event for ${targetLabel}.`,
    '',
    `Site: ${params.siteId}`,
    `Comment: ${params.comment.id}`,
    `Event: ${params.eventType}`,
    `Status: ${params.comment.status}`,
    `Reason: ${params.reason || params.comment.status}`,
    `Actor: ${params.actor || params.comment.reviewedBy || 'visitor'}`,
    `Request: ${params.requestId}`,
    '',
    `Author: ${params.comment.authorName || params.comment.authorEmail || 'Anonymous'}`,
    params.comment.authorEmail ? `Email: ${params.comment.authorEmail}` : '',
    '',
    params.comment.content,
  ].filter(Boolean).join('\n');

  return {
    to: params.to,
    from: params.config.from,
    subject,
    text,
    siteId: params.siteId,
    commentId: params.comment.id,
    entityType: 'comment',
    status: params.comment.status,
    requestId: params.requestId,
    values: {
      commentId: params.comment.id,
      eventType: params.eventType,
      targetType: params.comment.targetType,
      targetId: params.comment.targetId,
      status: params.comment.status,
      reason: params.reason || params.comment.status,
    },
  };
};

export const buildCommerceOrderNotificationEmail = (params: {
  config: EmailDeliveryConfig;
  siteId: string;
  order: {
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
  };
  requestId: string;
  to: string;
}): EmailDeliveryMessage => {
  const subject = `New order ${params.order.orderNumber}`;
  const text = [
    `Backy received a new commerce order for ${params.siteId}.`,
    '',
    `Site: ${params.siteId}`,
    `Order: ${params.order.id}`,
    `Order number: ${params.order.orderNumber}`,
    `Status: ${params.order.paymentStatus || 'pending'} / ${params.order.fulfillmentStatus || 'unfulfilled'}`,
    `Total: ${params.order.currency} ${params.order.total.toFixed(2)}`,
    `Items: ${params.order.itemCount ?? 0}`,
    `Customer: ${params.order.customerName || params.order.email || 'Customer'}`,
    params.order.email ? `Email: ${params.order.email}` : '',
    params.order.checkoutSessionId ? `Checkout session: ${params.order.checkoutSessionId}` : '',
    `Request: ${params.requestId}`,
  ].filter(Boolean).join('\n');

  return {
    to: params.to,
    from: params.config.from,
    subject,
    text,
    siteId: params.siteId,
    orderId: params.order.id,
    entityType: 'commerce-order',
    status: params.order.paymentStatus || 'pending',
    requestId: params.requestId,
    values: {
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
    },
  };
};

export const buildCommerceProductLowStockEmail = (params: {
  config: EmailDeliveryConfig;
  siteId: string;
  product: {
    id: string;
    slug: string;
    title: string;
    sku?: string;
    inventory: number;
    lowStockThreshold: number;
    orderNumber?: string;
    checkoutSessionId?: string;
  };
  requestId: string;
  to: string;
}): EmailDeliveryMessage => {
  const subject = `Low stock: ${params.product.title}`;
  const text = [
    `Backy detected low product stock for ${params.siteId}.`,
    '',
    `Site: ${params.siteId}`,
    `Product: ${params.product.title}`,
    `Product id: ${params.product.id}`,
    `Slug: ${params.product.slug}`,
    params.product.sku ? `SKU: ${params.product.sku}` : '',
    `Inventory: ${params.product.inventory}`,
    `Threshold: ${params.product.lowStockThreshold}`,
    params.product.orderNumber ? `Order: ${params.product.orderNumber}` : '',
    params.product.checkoutSessionId ? `Checkout session: ${params.product.checkoutSessionId}` : '',
    `Request: ${params.requestId}`,
  ].filter(Boolean).join('\n');

  return {
    to: params.to,
    from: params.config.from,
    subject,
    text,
    siteId: params.siteId,
    entityType: 'commerce-product',
    status: 'low-stock',
    requestId: params.requestId,
    values: {
      productId: params.product.id,
      productSlug: params.product.slug,
      productTitle: params.product.title,
      sku: params.product.sku || '',
      inventory: params.product.inventory,
      lowStockThreshold: params.product.lowStockThreshold,
      orderNumber: params.product.orderNumber || '',
      checkoutSessionId: params.product.checkoutSessionId || '',
    },
  };
};

const extractEmailAddress = (value: string): string => {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
};

const escapeSmtpHeader = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim();

const escapeSmtpBody = (value: string): string => value.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');

const buildSmtpMessage = (message: EmailDeliveryMessage): string => {
  const entityId = message.submissionId || message.commentId || message.orderId || message.requestId;
  return [
    `From: ${escapeSmtpHeader(message.from)}`,
    `To: ${escapeSmtpHeader(message.to)}`,
    `Subject: ${escapeSmtpHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${message.requestId}.${entityId}@backy.local>`,
    ...(message.headers ? [
      `List-Unsubscribe: ${escapeSmtpHeader(message.headers['List-Unsubscribe'])}`,
      `List-Unsubscribe-Post: ${escapeSmtpHeader(message.headers['List-Unsubscribe-Post'])}`,
    ] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    `X-Backy-Site-ID: ${escapeSmtpHeader(message.siteId)}`,
    ...(message.formId ? [`X-Backy-Form-ID: ${escapeSmtpHeader(message.formId)}`] : []),
    ...(message.submissionId ? [`X-Backy-Submission-ID: ${escapeSmtpHeader(message.submissionId)}`] : []),
    ...(message.commentId ? [`X-Backy-Comment-ID: ${escapeSmtpHeader(message.commentId)}`] : []),
    ...(message.orderId ? [`X-Backy-Order-ID: ${escapeSmtpHeader(message.orderId)}`] : []),
    ...(message.userId ? [`X-Backy-Admin-User-ID: ${escapeSmtpHeader(message.userId)}`] : []),
    '',
    escapeSmtpBody(message.text),
  ].join('\r\n');
};

const parseSmtpCode = (response: string): number => {
  const parsed = Number.parseInt(response.slice(0, 3), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const assertSmtpCode = (response: string, expected: number[], label: string): number => {
  const code = parseSmtpCode(response);
  if (!expected.includes(code)) {
    // Provider replies can echo AUTH credentials or private envelope/body data.
    throw new EmailDeliveryError(`SMTP ${label} failed with ${code || 'unknown'}.`, {
      statusCode: code || undefined,
    });
  }
  return code;
};

async function sendSmtpMessage(config: NonNullable<EmailDeliveryConfig['smtp']>, message: EmailDeliveryMessage): Promise<{ statusCode: number }> {
  if (!config.host) {
    throw new EmailDeliveryError('SMTP provider selected but BACKY_SMTP_HOST is not configured.');
  }

  const ehloDomain = readEnv('BACKY_SMTP_EHLO_DOMAIN') || 'backy.local';
  if (!/^[a-zA-Z0-9.-]+$/.test(ehloDomain)) throw new EmailDeliveryError('SMTP EHLO domain is invalid.');
  const tlsOptions: tls.ConnectionOptions = {
    host: config.host,
    port: config.port,
    // IP identities are checked by Node against the certificate IP SAN without SNI.
    ...(net.isIP(config.host) ? {} : { servername: config.host }),
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
  };
  let socket: net.Socket | tls.TLSSocket = config.secure ? tls.connect(tlsOptions) : net.connect({ host: config.host, port: config.port });
  let buffer = '';
  let responseLines: string[] = [];
  const responses: string[] = [];
  let failure: EmailDeliveryError | undefined;
  let pending: { resolve: (value: string) => void; reject: (error: EmailDeliveryError) => void } | undefined;
  let completed = false;
  const fail = (error: EmailDeliveryError) => {
    if (completed || failure) return;
    failure = error;
    pending?.reject(error);
    pending = undefined;
    socket.destroy();
  };
  const onError = () => fail(new EmailDeliveryError('SMTP connection or verified TLS negotiation failed.'));
  const onClose = () => fail(new EmailDeliveryError('SMTP connection closed before delivery completed.'));
  const onData = (chunk: Buffer) => {
    if (failure || socket.destroyed) return;
    buffer += chunk.toString('utf8');
    if (buffer.length + responseLines.join('').length > 65536) {
      fail(new EmailDeliveryError('SMTP response exceeds the supported size.'));
      return;
    }
    let boundary: number;
    while ((boundary = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, boundary).replace(/\r$/, '');
      buffer = buffer.slice(boundary + 1);
      if (!/^\d{3}[ -]/.test(line) || (responseLines.length && line.slice(0, 3) !== responseLines[0].slice(0, 3))) {
        fail(new EmailDeliveryError('SMTP returned an invalid response.'));
        return;
      }
      responseLines.push(line);
      if (line[3] === ' ') {
        const response = responseLines.join('\r\n');
        responseLines = [];
        if (pending) { const waiting = pending; pending = undefined; waiting.resolve(response); }
        else {
          // One greeting may arrive before its reader. Commands are sequential;
          // further unsolicited replies are invalid and must not grow the queue.
          if (responses.length) {
            fail(new EmailDeliveryError('SMTP returned unsolicited responses.'));
            return;
          }
          responses.push(response);
        }
      }
    }
  };
  const attach = (connection: net.Socket) => {
    connection.on('data', onData);
    connection.on('error', onError);
    connection.on('end', onClose);
    connection.on('close', onClose);
  };
  const detach = (connection: net.Socket) => {
    connection.off('data', onData);
    connection.off('error', onError);
    connection.off('end', onClose);
    connection.off('close', onClose);
  };
  attach(socket);
  const deadline = setTimeout(() => fail(new EmailDeliveryError('SMTP delivery timed out.')), 15000);
  const readResponse = () => new Promise<string>((resolve, reject) => {
    if (failure) { reject(failure); return; }
    const response = responses.shift();
    if (response) resolve(response);
    else pending = { resolve, reject };
  });
  const writeCommand = async (command: string) => {
    const response = readResponse();
    if (failure) return response;
    socket.write(`${command}\r\n`);
    return response;
  };
  const waitForTls = (connection: tls.TLSSocket) => new Promise<void>((resolve, reject) => {
    const cleanup = () => { connection.off('secureConnect', secure); connection.off('error', failed); connection.off('close', failed); };
    const failed = () => { cleanup(); reject(failure || new EmailDeliveryError('SMTP verified TLS negotiation failed.')); };
    const secure = () => {
      cleanup();
      if (!connection.authorized) { fail(new EmailDeliveryError('SMTP server certificate could not be verified.')); reject(failure); }
      else resolve();
    };
    connection.once('secureConnect', secure);
    connection.once('error', failed);
    connection.once('close', failed);
  });

  try {
    if (config.secure) await waitForTls(socket as tls.TLSSocket);
    assertSmtpCode(await readResponse(), [220], 'greeting');
    const hello = await writeCommand(`EHLO ${ehloDomain}`);
    assertSmtpCode(hello, [250], 'EHLO');
    if (!config.secure) {
      if (!hello.split('\r\n').some(line => /^250[ -]STARTTLS(?:\s|$)/i.test(line))) {
        throw new EmailDeliveryError('SMTP server does not offer required STARTTLS.');
      }
      assertSmtpCode(await writeCommand('STARTTLS'), [220], 'STARTTLS');
      // Plaintext SMTP state cannot survive the TLS boundary (RFC 3207).
      if (buffer || responseLines.length || responses.length) throw new EmailDeliveryError('SMTP returned unexpected plaintext data before TLS.');
      const plainSocket = socket;
      detach(plainSocket);
      const upgradedSocket = tls.connect({ ...tlsOptions, socket: plainSocket });
      socket = upgradedSocket;
      attach(upgradedSocket);
      await waitForTls(upgradedSocket);
      assertSmtpCode(await writeCommand(`EHLO ${ehloDomain}`), [250], 'EHLO after STARTTLS');
    }
    if (!(socket instanceof tls.TLSSocket) || !socket.encrypted || !socket.authorized) {
      throw new EmailDeliveryError('SMTP requires a verified encrypted connection.');
    }

    if (config.user && config.password) {
      const auth = Buffer.from(`\0${config.user}\0${config.password}`).toString('base64');
      assertSmtpCode(await writeCommand(`AUTH PLAIN ${auth}`), [235], 'AUTH PLAIN');
    }

    assertSmtpCode(await writeCommand(`MAIL FROM:<${extractEmailAddress(message.from)}>`), [250], 'MAIL FROM');
    assertSmtpCode(await writeCommand(`RCPT TO:<${extractEmailAddress(message.to)}>`), [250, 251], 'RCPT TO');
    assertSmtpCode(await writeCommand('DATA'), [354], 'DATA');
    const finalResponse = await writeCommand(`${buildSmtpMessage(message)}\r\n.`);
    const code = assertSmtpCode(finalResponse, [250], 'message body');
    completed = true;
    socket.write('QUIT\r\n');
    return { statusCode: code };
  } finally {
    clearTimeout(deadline);
    socket.off('data', onData);
    // Keep the harmless error listener through shutdown; late peer failures must not escape.
    if (completed) socket.end();
    else socket.destroy();
  }
}

export async function sendEmailMessage(config: EmailDeliveryConfig, message: EmailDeliveryMessage): Promise<{
  statusCode?: number;
  metadata?: Record<string, unknown>;
}> {
  if (message.from !== config.from) throw new EmailDeliveryError('The message sender is not the configured authorized sender.', { statusCode: 403 });
  if (config.senderPolicy && message.siteId !== config.senderPolicy.siteId) throw new EmailDeliveryError('Email configuration does not belong to this site.', { statusCode: 403 });

  if (config.provider === 'local-outbox') {
    return { statusCode: 202, metadata: { outboxOnly: true } };
  }

  if (config.provider === 'hostinger') {
    if (!config.hostinger) {
      throw new EmailDeliveryError('Hostinger provider selected but server configuration is missing.');
    }
    try {
      return await sendHostingerMailMessage(config.hostinger, message);
    } catch (error) {
      if (error instanceof HostingerMailError) {
        throw new EmailDeliveryError(error.message, { statusCode: error.statusCode, metadata: { provider: 'hostinger', reason: error.reason } });
      }
      throw new EmailDeliveryError('Hostinger Mail delivery failed.');
    }
  }

  if (config.provider === 'http-endpoint') {
    if (!config.endpoint) {
      throw new EmailDeliveryError('HTTP endpoint provider selected but no delivery endpoint is configured.');
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-backy-site-id': message.siteId,
      'x-backy-notification-channel': 'email',
    };
    if (message.formId) headers['x-backy-form-id'] = message.formId;
    if (message.submissionId) headers['x-backy-submission-id'] = message.submissionId;
    if (message.commentId) headers['x-backy-comment-id'] = message.commentId;
    if (message.orderId) headers['x-backy-order-id'] = message.orderId;
    if (message.userId) headers['x-backy-admin-user-id'] = message.userId;

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: message.to,
        from: message.from,
        subject: message.subject,
        text: message.text,
        siteId: message.siteId,
        formId: message.formId,
        submissionId: message.submissionId,
        commentId: message.commentId,
        orderId: message.orderId,
        userId: message.userId,
        entityType: message.entityType,
        status: message.status,
        requestId: message.requestId,
        values: message.values || {},
      }),
    });
    if (!response.ok) {
      throw new EmailDeliveryError(`Email endpoint returned ${response.status}`, { statusCode: response.status });
    }
    return { statusCode: response.status };
  }

  if (config.provider === 'resend') {
    if (!config.apiKey) {
      throw new EmailDeliveryError('Resend provider selected but BACKY_RESEND_API_KEY is not configured.');
    }
    const response = await fetch(config.endpoint || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        headers: {
          'X-Backy-Site-ID': message.siteId,
          ...(message.formId ? { 'X-Backy-Form-ID': message.formId } : {}),
          ...(message.submissionId ? { 'X-Backy-Submission-ID': message.submissionId } : {}),
          ...(message.commentId ? { 'X-Backy-Comment-ID': message.commentId } : {}),
          ...(message.orderId ? { 'X-Backy-Order-ID': message.orderId } : {}),
          ...(message.userId ? { 'X-Backy-Admin-User-ID': message.userId } : {}),
        },
      }),
    });
    const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null;
    if (!response.ok) {
      throw new EmailDeliveryError(payload?.message || `Resend returned ${response.status}`, { statusCode: response.status });
    }
    return {
      statusCode: response.status,
      metadata: payload?.id ? { providerMessageId: payload.id } : undefined,
    };
  }

  if (config.provider === 'smtp' && config.smtp) {
    return sendSmtpMessage(config.smtp, message);
  }

  throw new EmailDeliveryError(`Unsupported email provider: ${config.provider}`);
}
