import assert from 'node:assert/strict';
import { createWorkspaceLoadAuthority } from './workspaceLoadAuthority';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function main() {
  const authority = createWorkspaceLoadAuthority();
  const events: string[] = [];
  const aInventory = deferred<string>();
  const aDetails = deferred<string>();
  authority.setContext('site-a:user-editor:view');
  const old = authority.run(async isCurrent => {
    const inventory = await aInventory.promise;
    if (!isCurrent()) return;
    events.push(inventory);
    const details = await aDetails.promise;
    if (!isCurrent()) return;
    events.push(details);
  }, { error: () => events.push('a-error'), finish: () => events.push('a-finish') });
  aInventory.resolve('a-inventory');
  await Promise.resolve();
  assert.deepEqual(events, ['a-inventory'], 'Forms can still publish inventory before details finish.');
  authority.setContext('site-b:user-editor:manage');
  events.length = 0; // The route clears prior-site inventory on transition.
  const current = authority.run(async isCurrent => {
    await Promise.resolve();
    if (isCurrent()) events.push('b-inventory');
    await Promise.resolve();
    if (isCurrent()) events.push('b-details');
  }, { error: () => events.push('b-error'), finish: () => events.push('b-finish') });
  await current;
  aDetails.resolve('a-details');
  await old;
  assert.deepEqual(events, ['b-inventory', 'b-details', 'b-finish'], 'Late A details/finalizer cannot modify B.');

  events.length = 0;
  const late = deferred<string>();
  const failed = authority.run(async isCurrent => {
    const rows = await late.promise;
    if (isCurrent()) events.push(rows);
  }, { error: () => events.push('old-error'), finish: () => events.push('old-finish') });
  // A new site can be deferred by a mutation; context invalidation alone is enough.
  authority.setContext('site-c:other-user:pending');
  late.reject(new Error('Previous site denied'));
  await failed;
  assert.equal(events.length, 0, 'Transition invalidates old catch/finally even before the next read begins.');
  const unmounted = deferred<string>();
  const pending = authority.run(() => unmounted.promise, {
    success: value => events.push(value), error: () => events.push('error'), finish: () => events.push('finish'),
  });
  authority.invalidate();
  unmounted.resolve('old-private-submissions');
  await pending;
  assert.equal(events.length, 0, 'Unmount/revocation cannot publish an old inbox.');
  console.log('Forms staged load authority: PASS.');
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
