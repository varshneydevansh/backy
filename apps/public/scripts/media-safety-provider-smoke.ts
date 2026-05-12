import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  MediaSafetyError,
  scanMediaUploadWithProviders,
} from '../src/lib/mediaSafety';

const envKeys = [
  'BACKY_MEDIA_SCAN_PROVIDER',
  'BACKY_MEDIA_SCANNER_PROVIDER',
  'BACKY_MEDIA_SCAN_ENDPOINT',
  'BACKY_MEDIA_SCANNER_ENDPOINT',
  'BACKY_MEDIA_SCAN_API_KEY',
  'BACKY_MEDIA_SCANNER_API_KEY',
  'BACKY_MEDIA_SCAN_TIMEOUT_MS',
  'BACKY_MEDIA_SCANNER_TIMEOUT_MS',
  'BACKY_MEDIA_SCAN_FAIL_OPEN',
  'BACKY_MEDIA_SCANNER_FAIL_OPEN',
] as const;

const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

const restoreEnv = () => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

const resetScanEnv = () => {
  for (const key of envKeys) {
    delete process.env[key];
  }
};

const cleanPngInput = () => ({
  buffer: Buffer.from('provider-scan-smoke-png'),
  originalName: 'smoke.png',
  mimeType: 'image/png',
  mediaType: 'image' as const,
});

const assertMediaSafetyError = async (run: () => Promise<unknown>, message: string) => {
  let error: unknown;
  try {
    await run();
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof MediaSafetyError, message);
};

const scannerServer = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  request.on('end', () => {
    const body = Buffer.concat(chunks);
    const filename = request.headers['x-backy-media-filename'];
    const auth = request.headers.authorization;

    if (request.url === '/reject') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        status: 'infected',
        scanner: 'smoke-http-scanner',
        details: { signature: 'EICAR-Test-File' },
      }));
      return;
    }

    if (request.url === '/unavailable') {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        status: 'error',
        scanner: 'smoke-http-scanner',
      }));
      return;
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      status: 'clean',
      scanner: 'smoke-http-scanner',
      signature: `sha256:${body.length}`,
      warnings: filename === 'smoke.png' ? ['filename was decoded before scan'] : [],
      details: {
        bytes: body.length,
        mediaType: request.headers['x-backy-media-type'],
        authorized: auth === 'Bearer smoke-secret',
      },
    }));
  });
});

const main = async () => {
  try {
    await new Promise<void>((resolve) => scannerServer.listen(0, '127.0.0.1', resolve));
    const address = scannerServer.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    resetScanEnv();
    const defaultScan = await scanMediaUploadWithProviders(cleanPngInput());
    assert.equal(defaultScan.scanner, 'backy-static-media-safety-v1');
    assert.equal(defaultScan.providerScans, undefined);
    assert(!defaultScan.checks.includes('provider-http-scan'));

    resetScanEnv();
    process.env.BACKY_MEDIA_SCAN_PROVIDER = 'http';
    process.env.BACKY_MEDIA_SCAN_ENDPOINT = `${baseUrl}/scan`;
    process.env.BACKY_MEDIA_SCAN_API_KEY = 'smoke-secret';
    const providerScan = await scanMediaUploadWithProviders(cleanPngInput());
    assert.equal(providerScan.providerScans?.length, 1);
    assert(providerScan.scanner.includes('smoke-http-scanner'));
    assert(providerScan.checks.includes('provider-http-scan'));
    assert.equal(providerScan.providerScans?.[0]?.signature, 'sha256:23');
    assert.equal(providerScan.providerScans?.[0]?.details?.bytes, 23);
    assert.equal(providerScan.providerScans?.[0]?.details?.authorized, true);

    resetScanEnv();
  process.env.BACKY_MEDIA_SCAN_PROVIDER = 'http';
  process.env.BACKY_MEDIA_SCAN_ENDPOINT = `${baseUrl}/reject`;
  await assertMediaSafetyError(
    () => scanMediaUploadWithProviders(cleanPngInput()),
    'Rejected provider verdict should block uploads by default',
  );
  process.env.BACKY_MEDIA_SCAN_FAIL_OPEN = 'true';
  await assertMediaSafetyError(
    () => scanMediaUploadWithProviders(cleanPngInput()),
    'Rejected provider verdict should block uploads even when fail-open is enabled',
  );

  resetScanEnv();
  process.env.BACKY_MEDIA_SCAN_PROVIDER = 'http';
    await assertMediaSafetyError(
      () => scanMediaUploadWithProviders(cleanPngInput()),
      'Missing HTTP scanner endpoint should fail closed by default',
    );

    process.env.BACKY_MEDIA_SCAN_FAIL_OPEN = 'true';
    const failOpenScan = await scanMediaUploadWithProviders(cleanPngInput());
    assert(failOpenScan.checks.includes('provider-http-scan-not-configured'));
    assert(failOpenScan.warnings.some((warning) => warning.includes('fail-open')));

    process.env.BACKY_MEDIA_SCAN_ENDPOINT = `${baseUrl}/unavailable`;
    const unavailableScan = await scanMediaUploadWithProviders(cleanPngInput());
    assert(unavailableScan.checks.includes('provider-http-scan-failed-open'));
    assert(unavailableScan.warnings.some((warning) => warning.includes('503')));

  resetScanEnv();
  process.env.BACKY_MEDIA_SCAN_PROVIDER = 'clamav';
    await assertMediaSafetyError(
      () => scanMediaUploadWithProviders(cleanPngInput()),
      'Unsupported scanner providers should fail explicitly',
    );

  console.log(JSON.stringify({
    ok: true,
    cases: 8,
  }));
  } finally {
    restoreEnv();
    await new Promise<void>((resolve) => scannerServer.close(() => resolve()));
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
