import { defineConfig } from 'vitest/config';

// Deliberately does not load the SvelteKit plugin: the tests cover pure logic, and the plugin
// keeps a dev server alive that stops Vitest from exiting cleanly.
export default defineConfig({
	test: {
		environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
		isolate: false
	}
});
