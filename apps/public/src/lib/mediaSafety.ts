import { extname } from 'node:path';
import type { MediaItem } from '@backy-cms/core';

export type MediaSafetyScan = {
  status: 'clean';
  scannedAt: string;
  scanner: 'backy-static-media-safety-v1';
  checks: string[];
  warnings: string[];
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

const svgText = (buffer: Buffer) => (
  buffer.subarray(0, Math.min(buffer.length, 512 * 1024)).toString('utf8').toLowerCase()
);

const hasDangerousSvgMarkup = (content: string) => (
  content.includes('<script') ||
  content.includes('javascript:') ||
  content.includes('<foreignobject') ||
  /\son[a-z]+\s*=/.test(content)
);

export const scanMediaUpload = (input: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  mediaType: MediaItem['type'];
}): MediaSafetyScan => {
  const extension = extname(input.originalName).toLowerCase();
  const checks = ['non-empty-bytes', 'mime-category-accepted'];
  const warnings: string[] = [];

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

  return {
    status: 'clean',
    scannedAt: new Date().toISOString(),
    scanner: 'backy-static-media-safety-v1',
    checks,
    warnings,
  };
};
