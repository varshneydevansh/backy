import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const lockPathFor = (name) => {
  const safeName = String(name || 'smoke')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'smoke';
  return path.join(os.tmpdir(), `${safeName}.lock`);
};

export const withSmokeLock = async (name, task, options = {}) => {
  const lockPath = lockPathFor(name);
  const timeoutMs = Number(options.timeoutMs || 180000);
  const staleMs = Number(options.staleMs || 300000);
  const pollMs = Number(options.pollMs || 150);
  const startedAt = Date.now();
  let acquired = false;

  while (!acquired) {
    try {
      fs.mkdirSync(lockPath);
      fs.writeFileSync(path.join(lockPath, 'owner.json'), JSON.stringify({
        pid: process.pid,
        name,
        acquiredAt: new Date().toISOString(),
      }, null, 2));
      acquired = true;
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }

      let ageMs = 0;
      try {
        ageMs = Date.now() - (fs.statSync(lockPath).mtimeMs || Date.now());
      } catch (statError) {
        if (statError?.code === 'ENOENT') {
          continue;
        }
        throw statError;
      }
      if (ageMs > staleMs) {
        fs.rmSync(lockPath, { recursive: true, force: true });
        continue;
      }

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for smoke lock ${name} at ${lockPath}`);
      }
      await sleep(pollMs);
    }
  }

  try {
    return await task();
  } finally {
    fs.rmSync(lockPath, { recursive: true, force: true });
  }
};
