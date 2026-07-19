import { sequence } from "@sveltejs/kit/hooks";
import { handleErrorWithSentry, sentryHandle } from "@sentry/sveltekit";
import * as Sentry from '@sentry/sveltekit';
import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';

// Only report from real deployments, so local dev errors don't reach production monitoring
if (!dev) {
  Sentry.init({
    dsn: 'https://400f8ec8eaab4315bcda4f150e04f4fc@glitch.as93.net/2',
    tracesSampleRate: 0.1,
  });
}

// Set here (not just netlify.toml) so Docker / Node deployments get them too
const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  return response;
};

export const handle: Handle = dev
  ? securityHeaders
  : sequence(sentryHandle(), securityHeaders);

export const handleError = handleErrorWithSentry();
