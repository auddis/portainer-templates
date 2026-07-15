import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { sentrySvelteKit } from '@sentry/sveltekit';

export default defineConfig({
	plugins: [
		// Only upload source maps to Sentry when an auth token is provided,
		// so local and unauthenticated builds don't fail.
		sentrySvelteKit({ autoUploadSourceMaps: !!process.env.SENTRY_AUTH_TOKEN }),
		sveltekit(),
	],
});
