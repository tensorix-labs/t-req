import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
	output: 'server',
	adapter: cloudflare(),
	redirects: {
		'/install': 'https://raw.githubusercontent.com/tensorix-labs/t-req/main/install',
	},
	integrations: [
		starlight({
			title: 't-req',
			logo: {
				src: './src/assets/logo.jpg',
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
					label: 'Interfaces',
					items: [
						{ label: 'Core Library', slug: 'docs/interfaces/core-library' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'HTTP File Format', slug: 'docs/reference/http-file-format' },
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
