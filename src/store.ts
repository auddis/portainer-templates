import { writable } from 'svelte/store'
import type { Template } from '$src/Types';

export const templates = writable<Template[]>([]);
