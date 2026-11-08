import { normalizeFrontendObservation, type FrontendObservation } from '@backy-cms/core';

export const FRONTEND_OBSERVATION_MAX_BYTES = 262144;
/** Local file decoding only. Never fetches a supplied URL or imports a declaration. */
export function parseFrontendObservationFile(json: string, siteId: string): FrontendObservation {
  if (new TextEncoder().encode(json).length > FRONTEND_OBSERVATION_MAX_BYTES) throw new Error('Observation file exceeds 256 KiB. Capture a smaller marked tree.');
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Choose a rendered observation JSON object.');
  const envelope = parsed as Record<string, unknown>;
  const raw = envelope.schemaVersion === 'backy.frontend-dom-capture.v1' ? envelope.observation : parsed;
  if (raw == null) throw new Error('Capture has no frontend identity. Add the installed renderer identity and capture again.');
  const observation = normalizeFrontendObservation(raw);
  if (!observation || observation.siteId !== siteId) throw new Error('This observation belongs to a different site. Select that site before importing.');
  return observation;
}
