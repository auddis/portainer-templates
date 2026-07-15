import adapterNode from '@sveltejs/adapter-node';
import adapterNetlify from '@sveltejs/adapter-netlify';
import adapterVercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Pick the adapter based on the deploy target: Netlify or Vercel when building on
// their CI (detected via env vars), otherwise a standalone Node server for
// Docker / self-hosting (build/index.js, run with `node build`).
const adapter = process.env.NETLIFY
	? adapterNetlify()
	: process.env.VERCEL
		? adapterVercel()
		: adapterNode();

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		adapter,
		alias: {
      '$src/*': 'src/*',
    },
	}
};

export default config;
