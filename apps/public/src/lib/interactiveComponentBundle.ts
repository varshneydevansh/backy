import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { BackyInteractiveComponentIntegrity } from '@backy-cms/core';
import type { StorageAdapter } from '@backy/storage';
import { getMediaStorageAdapter } from './mediaStorage';

export class InteractiveComponentBundleError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const safeSegment = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
const equal = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

type ComponentBundleIdentity = {
  siteId: string;
  componentKey: string;
  version: string;
  status: string;
  reviewStatus?: string;
  integrity?: BackyInteractiveComponentIntegrity;
};

/** Read only the reviewed, version-scoped object; never fetch a registry URL. */
export async function loadVerifiedInteractiveComponentBundle(
  component: ComponentBundleIdentity,
  adapter?: Pick<StorageAdapter, 'provider' | 'read'>,
): Promise<string> {
  function fail(status: number, message: string): never { throw new InteractiveComponentBundleError(status, message); }
  if (component.status !== 'active' || component.reviewStatus !== 'approved') {
    fail(403, 'The component bundle has not been approved for execution.');
  }
  const secret = process.env.BACKY_COMPONENT_REGISTRY_SIGNING_KEY?.trim()
    || process.env.BACKY_INTERACTIVE_COMPONENT_SIGNING_KEY?.trim();
  if (!secret) fail(503, 'Component bundle verification is not configured.');
  const integrity = component.integrity;
  if (!integrity?.signed || integrity.algorithm !== 'sha256'
    || !/^[a-f0-9]{64}$/.test(integrity.sha256 || '')
    || !/^sha256=[a-f0-9]{64}$/.test(integrity.signature || '')) {
    fail(403, 'The component bundle has no verifiable signature.');
  }
  const path = integrity.storagePath || '';
  const prefix = `sites/${safeSegment(component.siteId)}/interactive-components/${safeSegment(component.componentKey)}/${safeSegment(component.version)}/`;
  const filename = path.slice(prefix.length);
  if (!path.startsWith(prefix) || !/^[a-z0-9._-]+\.(?:js|mjs)$/.test(filename)) {
    fail(403, 'The executable bundle must belong to this site, component, and version.');
  }
  if (!['application/javascript', 'text/javascript', 'application/ecmascript', 'text/ecmascript'].includes(integrity.contentType || '')) {
    fail(415, 'Executable bundles must contain a compiled JavaScript module.');
  }
  if (!Number.isSafeInteger(integrity.sizeBytes) || !integrity.sizeBytes || integrity.sizeBytes > 5 * 1024 * 1024) {
    fail(413, 'The component bundle exceeds the executable bundle size limit.');
  }
  const expectedSignature = `sha256=${createHmac('sha256', secret!).update(integrity.sha256!).digest('hex')}`;
  if (!equal(integrity.signature!, expectedSignature)) fail(403, 'The component bundle signature is invalid.');
  const storage = adapter || await getMediaStorageAdapter();
  if (storage.provider !== integrity.storageProvider) fail(503, 'The component bundle storage provider is unavailable.');
  let bytes: Buffer;
  try { bytes = await storage.read(path); } catch { return fail(503, 'The component bundle could not be read from storage.'); }
  if (bytes.length !== integrity.sizeBytes || !equal(createHash('sha256').update(bytes).digest('hex'), integrity.sha256!)) {
    fail(403, 'The stored component bundle failed integrity verification.');
  }
  return bytes.toString('base64');
}
