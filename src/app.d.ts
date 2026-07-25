// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			message: string;
			// A 404 slug that still matched a search shows these results in the error page
			query?: string;
			matches?: { entry: import('$src/Types').SearchEntry; plain: string }[];
		}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
