import { pathToFileURL } from 'node:url';

const EXPECTED_ORIGIN = 'https://qftmsqgerppchwyyszkg.supabase.co';
const EXPECTED_REPOSITORY = 'eiriknicholas/undercover-health';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Only these explicitly constructed codes and numeric HTTP statuses can leave
// the process. Never print response bodies, exception objects, headers or keys.
export async function probe({ url, key, fetcher = fetch, wait = sleep }) {
  if (url !== EXPECTED_ORIGIN || !key || typeof key !== 'string')
    return { ok: false, code: 'CONFIG_INVALID', attempts: 0 };
  let result = { ok: false, code: 'NETWORK_UNAVAILABLE', attempts: 0 };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetcher(`${EXPECTED_ORIGIN}/rest/v1/rpc/uc_pilot_health`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { apikey: key, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: '{}',
      });
      if (response.ok) {
        const value = await response.json();
        return { ok: value === true, code: value === true ? 'OK' : 'UNEXPECTED_RESPONSE', attempts: attempt, http_status: response.status };
      }
      const retryable = [429, 500, 502, 503, 504].includes(response.status);
      result = { ok: false, code: response.status === 401 || response.status === 403 ? 'ACCESS_DENIED' : 'DATABASE_UNAVAILABLE', attempts: attempt, http_status: response.status };
      if (!retryable) return result;
    } catch {
      result = { ok: false, code: 'NETWORK_UNAVAILABLE', attempts: attempt };
    }
    if (attempt < 3) await wait(1000);
  }
  return result;
}

export function publicStatus(result, now = new Date()) {
  return {
    service: 'Undercover database',
    checked_at: now.toISOString(),
    healthy: result.ok === true,
    code: result.code,
    attempts: result.attempts,
    ...(Number.isInteger(result.http_status) ? { http_status: result.http_status } : {}),
  };
}

// Persist useful, non-sensitive health history in this isolated monitor repo.
// GITHUB_TOKEN has access only to this repository and is never stored in Git.
export async function publishStatus(status, { token, repository, fetcher = fetch }) {
  if (!token || repository !== EXPECTED_REPOSITORY) return false;
  const endpoint = `https://api.github.com/repos/${EXPECTED_REPOSITORY}/contents/status.json`;
  const headers = {
    Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json',
  };
  try {
    const previous = await fetcher(endpoint, { headers, redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!previous.ok && previous.status !== 404) return false;
    const prior = previous.ok ? await previous.json() : {};
    if (previous.ok && !/^[0-9a-f]{40}$/.test(prior.sha ?? '')) return false;
    const response = await fetcher(endpoint, {
      method: 'PUT', headers, redirect: 'error', signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        message: status.healthy ? 'Record successful database health check' : 'Record unavailable database health check',
        content: Buffer.from(JSON.stringify(status, null, 2) + '\n').toString('base64'),
        ...(prior.sha ? { sha: prior.sha } : {}),
      }),
    });
    return response.ok;
  } catch { return false; }
}

async function main() {
  const result = await probe({
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
  const status = publicStatus(result);
  console.log(JSON.stringify(status));
  if (!process.argv.includes('--probe-only')) {
    const published = await publishStatus(status, { token: process.env.GITHUB_TOKEN, repository: process.env.GITHUB_REPOSITORY });
    console.log(JSON.stringify({ status_recorded: published }));
    if (!published) process.exitCode = 1;
  }
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Monitor failed; no diagnostic payload is printed.'); process.exitCode = 1; });
}
