import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Deliberately does not load the SvelteKit plugin: the tests cover pure logic, and the plugin
// keeps a dev server alive that stops Vitest from exiting cleanly.
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'node'
	}
});
