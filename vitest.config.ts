import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

// Config aparte de vite.config.ts para no levantar el plugin de PWA en tests.
// Solo necesitamos el alias $lib + parser TS; sveltekit() trae eso.
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'node'
	}
});
