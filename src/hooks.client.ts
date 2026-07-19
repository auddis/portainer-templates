import { handleErrorWithSentry, replayIntegration } from "@sentry/sveltekit";
import * as Sentry from '@sentry/sveltekit';
import { dev } from '$app/environment';

// Only report from real deployments, so local dev errors don't reach production monitoring
if (!dev) {
  Sentry.init({
    dsn: 'https://400f8ec8eaab4315bcda4f150e04f4fc@glitch.as93.net/2',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [replayIntegration()],
  });
}

export const handleError = handleErrorWithSentry();
