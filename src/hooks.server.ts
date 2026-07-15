import { sequence } from "@sveltejs/kit/hooks";
import { handleErrorWithSentry, sentryHandle } from "@sentry/sveltekit";
import * as Sentry from '@sentry/sveltekit';
import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';

// Only report from real deployments, so local dev errors don't reach production monitoring
if (!dev) {
  Sentry.init({
    dsn: 'https://400f8ec8eaab4315bcda4f150e04f4fc@glitch.as93.net/2',
    tracesSampleRate: 1.0,
  });
}

export const handle: Handle = dev
  ? ({ event, resolve }) => resolve(event)
  : sequence(sentryHandle());

export const handleError = handleErrorWithSentry();
