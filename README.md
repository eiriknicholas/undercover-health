# Undercover database health

Small independent monitor for the Undercover pilot. The game's source remains in its private repository. This public repository contains only the monitor, its minimal SQL function, documentation and sanitized health status.

The workflow runs at 01:17, 09:17 and 17:17 Europe/Oslo. It calls `public.uc_pilot_health()` through Supabase's API. That function runs `select true` as the caller, has no elevated privileges and neither reads nor writes game tables. A successful response verifies a request reached PostgreSQL. The job does not create players, games or messages.

## Cost boundary

- Keep this monitor repository **public**, use only the standard `ubuntu-24.04` runner, and retain the two-minute job timeout. [GitHub documents standard runners in public repositories as free](https://docs.github.com/en/billing/concepts/product-billing/github-actions). The job uploads no artifacts, uses no cache and has no paid services.
- Keep Supabase on **Free** with billing disabled. This monitor must not upgrade plans, attach payment methods or enable billable features.
- [Supabase says a few user database requests each day typically prevent pausing](https://supabase.com/docs/guides/platform/free-project-pausing). Three scheduled checks per day are a best-effort measure, not a contractual guarantee that a Free project can never pause.

The monitor records only timestamp, success, a fixed status code, attempt count and HTTP status in `status.json`. This provides a small useful health history. Regular status commits also keep the monitor repository active; GitHub may disable schedules in public repositories without repository activity for 60 days. GitHub schedules may be delayed or dropped, so a check can fail even when the service is healthy. Neither this job nor a successful check guarantees continuous service availability.

## Setup

1. Run `database/health-check.sql` once in the existing Undercover project's SQL editor.
2. Set the repository variable `SUPABASE_URL` to that project's HTTPS origin.
3. Set `SUPABASE_PUBLISHABLE_KEY` as a repository Actions secret using the existing public/publishable key. No database password, service-role key, user login or personal access token belongs here.
4. Set repository variable `MONITOR_ENABLED` to `true` only after the database function passes a real probe. Run the workflow manually once. Confirm both the check and status commit succeed before relying on its schedule. Set it to `false` to suspend checks without changing billing or credentials.

The manual `test_only` option runs the validation tests while leaving the production probe and status commit skipped. It works even while `MONITOR_ENABLED` is false; a green test-only run is not proof of a successful production check.

Credentials are read only from environment variables. The monitor never prints headers, response bodies or exception objects. Its only network targets are the fixed Undercover Supabase origin and this repository's GitHub contents API. The workflow's short-lived `GITHUB_TOKEN` can update this monitor repository's status file; no long-lived GitHub token is stored in the repository.

## Verify locally

With Node 20.11 or newer, `npm test` runs without installing dependencies. `node --env-file=PATH_TO_EXISTING_ENV scripts/check.mjs --probe-only` performs the real read-only check without recording status. The local probe also accepts the existing app's `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` environment-variable names. Never commit or copy credential files into this repository.

If a project is already paused, restore it from the Supabase dashboard first. If checks fail, inspect the fixed error code and restore service; do not repeatedly add credentials or upgrade billing. Before a real event, test sign-in and guest joining separately: this probe checks database liveness only.

## Removal

Disable this repository's workflow to stop automatic checks. The unused SQL function may remain without background work. Removing the database function requires a deliberate administrator action; no game data needs to be removed.
