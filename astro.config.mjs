// @ts-check
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { defineConfig } from 'astro/config';

import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
    site: 'https://moeyui1.github.io',
    integrations: [mdx(), sitemap(), tailwind()],

    vite: {
		server: {
			allowedHosts: ['claw-home.tail0a9150.ts.net'],
		},
	},

    markdown: {
		shikiConfig: {
			themes: {
				light: 'github-light',
				dark: 'github-dark',
			},
		},
	},

    adapter: cloudflare()
});