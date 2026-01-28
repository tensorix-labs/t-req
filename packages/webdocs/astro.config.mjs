import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	output: 'static',
	integrations: [
		starlight({
			title: 't-req',
			logo: {
				src: './public/logo.jpg',
				replacesTitle: true,
			},
			favicon: '/favicon.png',
			customCss: ['./src/styles/starlight.css'],
			sidebar: [
				{ label: 'Getting Started', slug: 'docs/getting-started' },
				{
					label: 'Guides',
					items: [
						{ label: 'BYO Test Runner', slug: 'docs/guides/byo-test-runner' },
						{ label: 'Observer Mode', slug: 'docs/guides/observer-mode' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'Configuration', slug: 'docs/reference/configuration' },
						{ label: 'CLI', slug: 'docs/reference/cli' },
					],
				},
			],
		}),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
