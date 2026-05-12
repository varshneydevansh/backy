import { extname } from 'node:path';
import { Socket } from 'node:net';
import type { MediaItem } from '@backy-cms/core';

export type MediaSafetyScan = {
  status: 'clean';
  scannedAt: string;
  scanner: 'backy-static-media-safety-v1' | string;
  checks: string[];
  warnings: string[];
  deliveryPolicy: 'inline-ok' | 'attachment-only';
  providerScans?: Array<{
    provider: 'http' | 'clamav';
    scanner: string;
    scannedAt: string;
    status: 'clean';
    signature?: string;
    details?: Record<string, unknown>;
  }>;
};

export type MediaSecurityPolicy = {
  status: 'clear' | 'quarantined';
  quarantinedAt?: string;
  quarantinedBy?: string;
  reason?: string;
  previousVisibility?: MediaItem['visibility'];
};

export class MediaSafetyError extends Error {
  code = 'MEDIA_SAFETY_SCAN_FAILED';
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'MediaSafetyError';
    this.details = details;
  }
}

type MediaScannerConfig = {
  provider: 'none' | 'http' | 'clamav';
  endpoint?: string;
  apiKey?: string;
  host?: string;
  port?: number;
  timeoutMs: number;
  failOpen: boolean;
};

const envValue = (names: string[]): string | undefined => {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
};

const envBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const envPositiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const resolveMediaScannerConfig = (): MediaScannerConfig => {
  const provider = (envValue(['BACKY_MEDIA_SCAN_PROVIDER', 'BACKY_MEDIA_SCANNER_PROVIDER']) || 'none').toLowerCase();
  const failOpen = envBoolean(envValue(['BACKY_MEDIA_SCAN_FAIL_OPEN', 'BACKY_MEDIA_SCANNER_FAIL_OPEN']), false);
  const timeoutMs = envPositiveInteger(envValue(['BACKY_MEDIA_SCAN_TIMEOUT_MS', 'BACKY_MEDIA_SCANNER_TIMEOUT_MS']), 5000);

  if (provider === 'none' || provider === 'off' || provider === 'disabled') {
    return { provider: 'none', timeoutMs, failOpen };
  }

  if (provider !== 'http') {
    if (provider === 'clamav' || provider === 'clamd') {
      return {
        provider: 'clamav',
        host: envValue(['BACKY_MEDIA_SCAN_HOST', 'BACKY_MEDIA_SCANNER_HOST', 'BACKY_CLAMAV_HOST', 'CLAMD_HOST']) || '127.0.0.1',
        port: envPositiveInteger(envValue(['BACKY_MEDIA_SCAN_PORT', 'BACKY_MEDIA_SCANNER_PORT', 'BACKY_CLAMAV_PORT', 'CLAMD_PORT']), 3310),
        timeoutMs,
        failOpen,
      };
    }

    throw new MediaSafetyError('Unsupported media scan provider.', {
      provider,
      supportedProviders: ['none', 'http', 'clamav'],
    });
  }

  return {
    provider: 'http',
    endpoint: envValue(['BACKY_MEDIA_SCAN_ENDPOINT', 'BACKY_MEDIA_SCANNER_ENDPOINT']),
    apiKey: envValue(['BACKY_MEDIA_SCAN_API_KEY', 'BACKY_MEDIA_SCANNER_API_KEY']),
    timeoutMs,
    failOpen,
  };
};

const svgText = (buffer: Buffer) => (
  buffer.subarray(0, Math.min(buffer.length, 512 * 1024)).toString('utf8').toLowerCase()
);

const hasDangerousSvgMarkup = (content: string) => (
  content.includes('<script') ||
  content.includes('javascript:') ||
  content.includes('<foreignobject') ||
  /\son[a-z]+\s*=/.test(content)
);

const ACTIVE_WEB_CONTENT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.htm',
  '.html',
  '.js',
  '.mjs',
  '.svg',
  '.ts',
  '.tsx',
  '.xhtml',
  '.xml',
]);

const ACTIVE_WEB_CONTENT_MIME_TYPES = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/xhtml+xml',
  'application/xml',
  'image/svg+xml',
  'text/css',
  'text/ecmascript',
  'text/html',
  'text/javascript',
  'text/xml',
]);

export const requiresAttachmentDelivery = (input: {
  originalName?: string | null;
  filename?: string | null;
  mimeType?: string | null;
}): boolean => {
  const extension = extname(input.originalName || input.filename || '').toLowerCase();
  const mimeType = (input.mimeType || '').trim().toLowerCase().split(';')[0];
  return ACTIVE_WEB_CONTENT_EXTENSIONS.has(extension) || ACTIVE_WEB_CONTENT_MIME_TYPES.has(mimeType);
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const getMediaSecurityPolicy = (metadata: unknown): MediaSecurityPolicy => {
  if (!isRecord(metadata) || !isRecord(metadata.mediaSecurity)) {
    return { status: 'clear' };
  }

  const record = metadata.mediaSecurity;
  if (record.status !== 'quarantined') {
    return { status: 'clear' };
  }

  const previousVisibility = record.previousVisibility === 'private' ? 'private' : 'public';
  return {
    status: 'quarantined',
    previousVisibility,
    ...(typeof record.quarantinedAt === 'string' ? { quarantinedAt: record.quarantinedAt } : {}),
    ...(typeof record.quarantinedBy === 'string' ? { quarantinedBy: record.quarantinedBy } : {}),
    ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
  };
};

export const isMediaQuarantined = (input: { metadata?: unknown } | unknown): boolean => {
  const metadata = isRecord(input) && 'metadata' in input ? input.metadata : input;
  return getMediaSecurityPolicy(metadata).status === 'quarantined';
};

export const scanMediaUpload = (input: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  mediaType: MediaItem['type'];
}): MediaSafetyScan => {
  const extension = extname(input.originalName).toLowerCase();
  const checks = ['non-empty-bytes', 'mime-category-accepted'];
  const warnings: string[] = [];
  const deliveryPolicy = requiresAttachmentDelivery(input) ? 'attachment-only' : 'inline-ok';

  if (input.buffer.length === 0) {
    throw new MediaSafetyError('Uploaded file is empty.', { reason: 'empty-file' });
  }

  if (input.mediaType === 'image') {
    checks.push('image-policy');

    if (input.mimeType === 'image/svg+xml' || extension === '.svg') {
      checks.push('svg-active-content-policy');
      if (hasDangerousSvgMarkup(svgText(input.buffer))) {
        throw new MediaSafetyError('SVG files with scripts, event handlers, foreignObject, or javascript URLs are not allowed.', {
          reason: 'dangerous-svg',
          mimeType: input.mimeType,
          extension,
        });
      }
    }
  }

  if (input.mediaType === 'font') {
    checks.push('font-extension-policy');
    const allowedFontExtensions = ['.woff', '.woff2', '.ttf', '.otf', '.eot'];
    if (!allowedFontExtensions.includes(extension)) {
      warnings.push('Font MIME type accepted without a standard font extension.');
    }
  }

  if (input.mediaType === 'document') {
    checks.push('document-extension-policy');
    const allowedDocumentExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv'];
    if (!allowedDocumentExtensions.includes(extension)) {
      warnings.push('Document MIME type accepted without a standard document extension.');
    }
  }

  if (deliveryPolicy === 'attachment-only') {
    checks.push('active-web-content-attachment-policy');
    warnings.push('Active web content is stored but must be delivered as an attachment.');
  }

  return {
    status: 'clean',
    scannedAt: new Date().toISOString(),
    scanner: 'backy-static-media-safety-v1',
    checks,
    warnings,
    deliveryPolicy,
  };
};

const normalizeProviderScanResponse = async (response: Response): Promise<Record<string, unknown>> => {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return { raw: text.slice(0, 500) };
  }
};

const mergeProviderWarnings = (
  staticScan: MediaSafetyScan,
  warnings: unknown,
): string[] => {
  const providerWarnings = Array.isArray(warnings)
    ? warnings.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  return Array.from(new Set([...staticScan.warnings, ...providerWarnings]));
};

const parseClamAvResponse = (value: string) => {
  const response = value.replace(/\0/g, '').trim();
  const foundMatch = response.match(/:\s*(.+?)\s+FOUND$/i);
  const errorMatch = response.match(/:\s*(.+?)\s+ERROR$/i);

  if (/\bOK$/i.test(response)) {
    return { status: 'clean' as const, response };
  }

  if (foundMatch) {
    return {
      status: 'infected' as const,
      signature: foundMatch[1]?.trim() || 'unknown',
      response,
    };
  }

  if (errorMatch) {
    return {
      status: 'error' as const,
      error: errorMatch[1]?.trim() || response,
      response,
    };
  }

  return {
    status: 'error' as const,
    error: response || 'Empty clamd response',
    response,
  };
};

const writeClamAvChunk = (socket: Socket, chunk: Buffer) => new Promise<void>((resolve, reject) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(chunk.length, 0);
  socket.write(Buffer.concat([length, chunk]), (error) => {
    if (error) reject(error);
    else resolve();
  });
});

const scanWithClamAv = (input: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  mediaType: MediaItem['type'];
  config: MediaScannerConfig;
}) => new Promise<{ scanner: string; signature?: string; details: Record<string, unknown> }>((resolve, reject) => {
  const host = input.config.host || '127.0.0.1';
  const port = input.config.port || 3310;
  const socket = new Socket();
  const chunks: Buffer[] = [];
  let settled = false;

  const finish = (error: Error | null, value?: { scanner: string; signature?: string; details: Record<string, unknown> }) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    if (error) reject(error);
    else if (value) resolve(value);
    else reject(new Error('ClamAV scanner returned no verdict.'));
  };

  const timeout = setTimeout(() => {
    finish(new Error(`ClamAV scanner timed out after ${input.config.timeoutMs}ms.`));
  }, input.config.timeoutMs);

  socket.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  socket.on('error', (error) => {
    clearTimeout(timeout);
    finish(error);
  });
  socket.on('end', () => {
    clearTimeout(timeout);
    const parsed = parseClamAvResponse(Buffer.concat(chunks).toString('utf8'));
    if (parsed.status === 'clean') {
      finish(null, {
        scanner: 'clamav-clamd',
        details: {
          response: parsed.response,
          host,
          port,
          bytes: input.buffer.length,
          mediaType: input.mediaType,
          mimeType: input.mimeType,
        },
      });
      return;
    }

    if (parsed.status === 'infected') {
      finish(new MediaSafetyError('ClamAV scanner rejected the uploaded file.', {
        reason: 'clamav-infected',
        scanner: 'clamav-clamd',
        signature: parsed.signature,
        details: {
          response: parsed.response,
          host,
          port,
          mediaType: input.mediaType,
          mimeType: input.mimeType,
          originalName: input.originalName,
        },
      }));
      return;
    }

    finish(new MediaSafetyError('ClamAV scanner request failed.', {
      reason: 'clamav-error',
      scanner: 'clamav-clamd',
      error: parsed.error,
      details: {
        response: parsed.response,
        host,
        port,
      },
    }));
  });

  socket.connect(port, host, async () => {
    try {
      socket.write('zINSTREAM\0');
      const chunkSize = 64 * 1024;
      for (let offset = 0; offset < input.buffer.length; offset += chunkSize) {
        await writeClamAvChunk(socket, input.buffer.subarray(offset, offset + chunkSize));
      }
      await writeClamAvChunk(socket, Buffer.alloc(0));
    } catch (error) {
      clearTimeout(timeout);
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
});

const failOpenProviderScan = (staticScan: MediaSafetyScan, provider: string, error: unknown): MediaSafetyScan => ({
  ...staticScan,
  checks: [...staticScan.checks, `provider-${provider}-scan-failed-open`],
  warnings: [...staticScan.warnings, `Provider media scanner failed open: ${error instanceof Error ? error.message : String(error)}`],
});

export const scanMediaUploadWithProviders = async (input: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  mediaType: MediaItem['type'];
}): Promise<MediaSafetyScan> => {
  const staticScan = scanMediaUpload(input);
  let scannerConfig: MediaScannerConfig;

  try {
    scannerConfig = resolveMediaScannerConfig();
  } catch (error) {
    if (error instanceof MediaSafetyError) throw error;
    throw new MediaSafetyError('Unable to resolve media scanner configuration.', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (scannerConfig.provider === 'none') {
    return staticScan;
  }

  if (scannerConfig.provider === 'clamav') {
    try {
      const providerScan = await scanWithClamAv({
        ...input,
        config: scannerConfig,
      });

      return {
        ...staticScan,
        scanner: `${staticScan.scanner}+${providerScan.scanner}`,
        checks: Array.from(new Set([...staticScan.checks, 'provider-clamav-scan'])),
        providerScans: [
          ...(staticScan.providerScans || []),
          {
            provider: 'clamav',
            scanner: providerScan.scanner,
            scannedAt: new Date().toISOString(),
            status: 'clean',
            ...(providerScan.signature ? { signature: providerScan.signature } : {}),
            details: providerScan.details,
          },
        ],
      };
    } catch (error) {
      if (error instanceof MediaSafetyError) {
        if (!scannerConfig.failOpen || error.details.reason === 'clamav-infected') throw error;
        return failOpenProviderScan(staticScan, 'clamav', error);
      }

      if (!scannerConfig.failOpen) {
        throw new MediaSafetyError('ClamAV scanner request failed.', {
          reason: 'clamav-request-failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return failOpenProviderScan(staticScan, 'clamav', error);
    }
  }

  if (!scannerConfig.endpoint) {
    if (scannerConfig.failOpen) {
      return {
        ...staticScan,
        checks: [...staticScan.checks, 'provider-http-scan-not-configured'],
        warnings: [...staticScan.warnings, 'Provider media scanner is not configured; upload allowed because fail-open is enabled.'],
      };
    }
    throw new MediaSafetyError('HTTP media scan provider selected but no scan endpoint is configured.', {
      reason: 'missing-scanner-endpoint',
      provider: scannerConfig.provider,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), scannerConfig.timeoutMs);
  const requestBody = new Uint8Array(input.buffer);

  try {
    const response = await fetch(scannerConfig.endpoint, {
      method: 'POST',
      headers: {
        'content-type': input.mimeType || 'application/octet-stream',
        'x-backy-media-filename': encodeURIComponent(input.originalName),
        'x-backy-media-type': input.mediaType,
        'x-backy-media-size': String(input.buffer.length),
        ...(scannerConfig.apiKey ? { authorization: `Bearer ${scannerConfig.apiKey}` } : {}),
      },
      body: requestBody,
      signal: controller.signal,
    });
    const payload = await normalizeProviderScanResponse(response);
    const status = typeof payload.status === 'string' ? payload.status.toLowerCase() : response.ok ? 'clean' : 'error';
    const scanner = typeof payload.scanner === 'string' && payload.scanner.trim().length > 0
      ? payload.scanner
      : 'http-media-scanner';

    if (!response.ok) {
      throw new MediaSafetyError('Media scanner request failed.', {
        reason: 'scanner-http-error',
        statusCode: response.status,
        scanner,
        details: payload,
      });
    }

    if (status !== 'clean') {
      throw new MediaSafetyError('Media scanner rejected the uploaded file.', {
        reason: status || 'scanner-rejected',
        statusCode: response.status,
        scanner,
        details: payload,
      });
    }

    return {
      ...staticScan,
      scanner: `${staticScan.scanner}+${scanner}`,
      checks: Array.from(new Set([...staticScan.checks, 'provider-http-scan'])),
      warnings: mergeProviderWarnings(staticScan, payload.warnings),
      providerScans: [
        ...(staticScan.providerScans || []),
        {
          provider: 'http',
          scanner,
          scannedAt: new Date().toISOString(),
          status: 'clean',
          ...(typeof payload.signature === 'string' ? { signature: payload.signature } : {}),
          ...(isRecord(payload.details) ? { details: payload.details } : {}),
        },
      ],
    };
  } catch (error) {
    if (error instanceof MediaSafetyError) {
      const statusCode = typeof error.details.statusCode === 'number' ? error.details.statusCode : 0;
      const canFailOpen = error.details.reason === 'scanner-http-error' && ([408, 429].includes(statusCode) || statusCode >= 500);
      if (!scannerConfig.failOpen || !canFailOpen) throw error;
      const statusSuffix = statusCode ? ` (HTTP ${statusCode})` : '';
      return {
        ...staticScan,
        checks: [...staticScan.checks, 'provider-http-scan-failed-open'],
        warnings: [...staticScan.warnings, `Provider media scanner failed open: ${error.message}${statusSuffix}`],
      };
    }

    if (!scannerConfig.failOpen) {
      throw new MediaSafetyError('Media scanner request failed.', {
        reason: 'scanner-request-failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      ...staticScan,
      checks: [...staticScan.checks, 'provider-http-scan-failed-open'],
      warnings: [...staticScan.warnings, `Provider media scanner failed open: ${error instanceof Error ? error.message : String(error)}`],
    };
  } finally {
    clearTimeout(timeout);
  }
};
