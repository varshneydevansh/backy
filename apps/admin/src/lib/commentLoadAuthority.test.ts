import assert from 'node:assert/strict';
import { createCommentLoadAuthority } from './commentLoadAuthority';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function main() {
  const authority = createCommentLoadAuthority();
  const events: string[] = [];
  const callbacks = (name: string) => ({
    success: (rows: string[]) => events.push(`${name}:rows:${rows.join(',')}`),
    error: () => events.push(`${name}:error`),
    finish: () => events.push(`${name}:finish`),
  });
  authority.setContext('site-a:user-editor:read');
  const a = deferred<string[]>();
  const oldRequest = authority.run(() => a.promise, callbacks('a'));
  authority.setContext('site-b:user-editor:manage');
  const b = deferred<string[]>();
  // A remains in flight: B must begin without waiting for a loading flag to clear.
  const newRequest = authority.run(() => b.promise, callbacks('b'));
  b.resolve(['b-comment']);
  await newRequest;
  a.resolve(['a-comment']);
  await oldRequest;
  assert.deepEqual(events, ['b:rows:b-comment', 'b:finish'], 'Late A cannot replace B rows or finish B loading.');

  events.length = 0;
  const staleFailure = deferred<string[]>();
  const failedOldRequest = authority.run(() => staleFailure.promise, callbacks('old-user'));
  authority.setContext('site-b:other-user:pending');
  staleFailure.reject(new Error('Previous user access denied'));
  await failedOldRequest;
  assert.deepEqual(events, [], 'Previous-user errors/finalizers cannot clear current state.');

  const denied = deferred<string[]>();
  const deniedRequest = authority.run(() => denied.promise, callbacks('revoked'));
  authority.invalidate();
  denied.resolve(['private-comment']);
  await deniedRequest;
  assert.deepEqual(events, [], 'Revocation or unmount invalidates pending reads.');

  const first = deferred<string[]>();
  const second = deferred<string[]>();
  const firstRefresh = authority.run(() => first.promise, callbacks('first'));
  const latestRefresh = authority.run(() => second.promise, callbacks('latest'));
  // Ordinary renders keep identical context; they must not cancel the current read.
  authority.setContext('site-b:other-user:pending');
  first.reject(new Error('Old refresh failed'));
  await firstRefresh;
  second.resolve(['latest-comment']);
  await latestRefresh;
  assert.deepEqual(events, ['latest:rows:latest-comment', 'latest:finish']);

  events.length = 0;
  await authority.run(async () => { throw new Error('Current request failed'); }, callbacks('current'));
  assert.deepEqual(events, ['current:error', 'current:finish'], 'Current failures retain recovery and stop loading.');
  console.log('Comment aggregate load authority: PASS (site/user transition, revocation, latest refresh, errors/finalizers).');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
