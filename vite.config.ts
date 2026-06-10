import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const ahora = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const stampVersion = `v1.0.${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}${pad(ahora.getHours())}${pad(ahora.getMinutes())}`;

export default defineConfig(({ mode }) => ({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: 'index.html' })
		}),
		VitePWA({
			registerType: 'autoUpdate',
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'sw.js',
			injectManifest: {
				globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
				globIgnores: ['**/sw.js']
			},
			manifest: {
				name: 'Torneos de Pádel',
				short_name: 'Torneos',
				description: 'Gestión de torneos de pádel',
				theme_color: '#000000',
				background_color: '#ffffff',
				display: 'standalone',
				start_url: '/',
				icons: [
					{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
				]
			}
		})
	],
	define: {
		__APP_VERSION__: JSON.stringify(mode === 'deploy' ? stampVersion : 'dev')
	}
}));
