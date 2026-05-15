import net from 'node:net';
import tls from 'node:tls';
import type { Comment, FormDefinition, FormSubmission } from '@backy-cms/core';

export type EmailDeliveryProvider = 'local-outbox' | 'http-endpoint' | 'resend' | 'smtp';

export interface EmailDeliveryMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  siteId: string;
  formId?: string;
  submissionId?: string;
  commentId?: string;
  userId?: string;
  entityType?: 'form-submission' | 'comment' | 'admin-invite' | 'admin-password-reset';
  status: string;
  requestId: string;
  values?: Record<string, unknown>;
}

export interface EmailDeliveryConfig {
  provider: EmailDeliveryProvider;
  from: string;
  endpoint?: string;
  apiKey?: string;
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

export const getEmailDeliveryConfig = (): EmailDeliveryConfig => {
  const providerOverride = readEnv('BACKY_EMAIL_PROVIDER', 'BACKY_TRANSACTIONAL_EMAIL_PROVIDER').toLowerCase();
  const endpoint = readEnv('BACKY_EMAIL_DELIVERY_ENDPOINT', 'BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL');
  const resendApiKey = readEnv('BACKY_RESEND_API_KEY', 'RESEND_API_KEY');
  const resendApiUrl = readEnv('BACKY_RESEND_API_URL') || 'https://api.resend.com/emails';
  const smtpHost = readEnv('BACKY_SMTP_HOST', 'SMTP_HOST');
  const smtpPort = Number.parseInt(readEnv('BACKY_SMTP_PORT', 'SMTP_PORT') || '', 10);
  const from = getEmailFromAddress();

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

const extractEmailAddress = (value: string): string => {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
};

const escapeSmtpHeader = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim();

const escapeSmtpBody = (value: string): string => value.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');

const buildSmtpMessage = (message: EmailDeliveryMessage): string => {
  const entityId = message.submissionId || message.commentId || message.requestId;
  return [
    `From: ${escapeSmtpHeader(message.from)}`,
    `To: ${escapeSmtpHeader(message.to)}`,
    `Subject: ${escapeSmtpHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${message.requestId}.${entityId}@backy.local>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    `X-Backy-Site-ID: ${escapeSmtpHeader(message.siteId)}`,
    ...(message.formId ? [`X-Backy-Form-ID: ${escapeSmtpHeader(message.formId)}`] : []),
    ...(message.submissionId ? [`X-Backy-Submission-ID: ${escapeSmtpHeader(message.submissionId)}`] : []),
    ...(message.commentId ? [`X-Backy-Comment-ID: ${escapeSmtpHeader(message.commentId)}`] : []),
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
    throw new EmailDeliveryError(`SMTP ${label} failed with ${code || 'unknown'}: ${response.slice(0, 180)}`, {
      statusCode: code || undefined,
    });
  }
  return code;
};

async function sendSmtpMessage(config: NonNullable<EmailDeliveryConfig['smtp']>, message: EmailDeliveryMessage): Promise<{ statusCode: number }> {
  if (!config.host) {
    throw new EmailDeliveryError('SMTP provider selected but BACKY_SMTP_HOST is not configured.');
  }

  const socket = await new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
    const connection = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host }, () => resolve(connection))
      : net.connect({ host: config.host, port: config.port }, () => resolve(connection));
    connection.once('error', reject);
    connection.setTimeout(15000, () => {
      connection.destroy();
      reject(new EmailDeliveryError('SMTP connection timed out.'));
    });
  });

  socket.setEncoding('utf8');
  let buffer = '';
  const pending: Array<(value: string) => void> = [];

  const takeCompleteResponse = (): string | null => {
    const lines = buffer.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return null;
    const lastLine = lines[lines.length - 1] || '';
    if (!/^\d{3} /.test(lastLine)) return null;
    const response = buffer;
    buffer = '';
    return response;
  };

  const onData = (chunk: string) => {
    buffer += chunk;
    const response = takeCompleteResponse();
    if (response && pending.length > 0) pending.shift()?.(response);
  };
  socket.on('data', onData);

  const readResponse = () => new Promise<string>((resolve) => {
    const response = takeCompleteResponse();
    if (response) {
      resolve(response);
      return;
    }
    pending.push(resolve);
  });
  const writeCommand = async (command: string) => {
    socket.write(`${command}\r\n`);
    return readResponse();
  };

  try {
    assertSmtpCode(await readResponse(), [220], 'greeting');
    assertSmtpCode(await writeCommand(`EHLO ${readEnv('BACKY_SMTP_EHLO_DOMAIN') || 'backy.local'}`), [250], 'EHLO');

    if (config.user && config.password) {
      const auth = Buffer.from(`\0${config.user}\0${config.password}`).toString('base64');
      assertSmtpCode(await writeCommand(`AUTH PLAIN ${auth}`), [235], 'AUTH PLAIN');
    }

    assertSmtpCode(await writeCommand(`MAIL FROM:<${extractEmailAddress(message.from)}>`), [250], 'MAIL FROM');
    assertSmtpCode(await writeCommand(`RCPT TO:<${extractEmailAddress(message.to)}>`), [250, 251], 'RCPT TO');
    assertSmtpCode(await writeCommand('DATA'), [354], 'DATA');
    const finalResponse = await new Promise<string>((resolve) => {
      pending.push(resolve);
      socket.write(`${buildSmtpMessage(message)}\r\n.\r\n`);
    });
    const code = assertSmtpCode(finalResponse, [250], 'message body');
    socket.write('QUIT\r\n');
    return { statusCode: code };
  } finally {
    socket.off('data', onData);
    socket.end();
  }
}

export async function sendEmailMessage(config: EmailDeliveryConfig, message: EmailDeliveryMessage): Promise<{
  statusCode?: number;
  metadata?: Record<string, unknown>;
}> {
  if (config.provider === 'local-outbox') {
    return { statusCode: 202, metadata: { outboxOnly: true } };
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
