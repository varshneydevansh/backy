#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.resolve(scriptDir, '..');
const routeSource = readFileSync(
  path.join(publicRoot, 'src/app/api/admin/auth/bootstrap-owner/route.ts'),
  'utf8',
);
const sitesRouteSource = readFileSync(
  path.join(publicRoot, 'src/app/api/admin/sites/route.ts'),
  'utf8',
);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

assert(
  routeSource.includes("envValue(['BACKY_OWNER_BOOTSTRAP_TOKEN', 'BACKY_ADMIN_BOOTSTRAP_TOKEN'])") &&
    routeSource.includes('secureEqual(providedToken, configuredToken)') &&
    routeSource.includes('timingSafeEqual') &&
    routeSource.includes('createHash'),
  'Owner bootstrap must require a server-only token and compare it without raw string equality.',
);

assert(
  routeSource.includes("process.env.BACKY_DATA_MODE !== 'database'") &&
    routeSource.includes('Supabase URL and server-only service role key are required') &&
    routeSource.includes("'/auth/v1/admin/users'") &&
    routeSource.includes("'/rest/v1/profiles?on_conflict=id'"),
  'Owner bootstrap must run only in database mode and create both Supabase Auth identity and Backy owner profile.',
);

assert(
  routeSource.includes('activeOwnerExists') &&
    routeSource.includes('OWNER_ALREADY_EXISTS') &&
    routeSource.includes('one-time') &&
    routeSource.includes('/rest/v1/profiles?select=id,email,role,status&role=eq.owner&status=eq.active&limit=1'),
  'Owner bootstrap must be one-time and refuse to create a second active owner.',
);

assert(
  routeSource.includes('/rest/v1/team_members?on_conflict=team_id,user_id') &&
    routeSource.includes('/rest/v1/teams?select=id,name,slug,owner_id&limit=2') &&
    routeSource.includes('Backy Workspace'),
  'Owner bootstrap must create or attach the initial owner workspace membership.',
);

assert(
  routeSource.includes("nextStep: 'Sign in through backy-admin with this owner email and password.") &&
    !routeSource.includes('bootstrapToken:'),
  'Owner bootstrap response must guide sign-in without echoing the bootstrap token.',
);

assert(
  sitesRouteSource.includes('const teams = await repositories.teams.list({ limit: 2, offset: 0 });') &&
    sitesRouteSource.includes('teams.items.length === 1') &&
    sitesRouteSource.includes('return teams.items[0].id;'),
  'Site creation must infer the single bootstrapped workspace team when no site exists yet.',
);

console.log('Backy owner bootstrap source smoke passed.');
