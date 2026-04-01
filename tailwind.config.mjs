/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
	darkMode: 'class',
	theme: {
		extend: {
			fontFamily: {
				sans: [
					'"Noto Sans SC"',
					'"Inter"',
					'system-ui',
					'-apple-system',
					'sans-serif',
				],
				mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
			},
			colors: {
				primary: {
					50: '#f0f9ff',
					100: '#e0f2fe',
					200: '#bae6fd',
					300: '#7dd3fc',
					400: '#38bdf8',
					500: '#0ea5e9',
					600: '#0284c7',
					700: '#0369a1',
					800: '#075985',
					900: '#0c4a6e',
					950: '#082f49',
				},
				accent: {
					400: '#818cf8',
					500: '#6366f1',
					600: '#4f46e5',
				},
			},
			typography: ({ theme }) => ({
				DEFAULT: {
					css: {
						'--tw-prose-body': theme('colors.zinc.700'),
						'--tw-prose-headings': theme('colors.zinc.900'),
						'--tw-prose-links': theme('colors.primary.600'),
						'--tw-prose-code': theme('colors.primary.700'),
						'--tw-prose-pre-bg': theme('colors.zinc.50'),
						maxWidth: '72ch',
						a: {
							textDecoration: 'underline',
							textUnderlineOffset: '3px',
							'&:hover': {
								color: theme('colors.primary.500'),
							},
						},
						code: {
							fontWeight: '500',
						},
						'code::before': { content: '""' },
						'code::after': { content: '""' },
					},
				},
				invert: {
					css: {
						'--tw-prose-body': theme('colors.zinc.300'),
						'--tw-prose-headings': theme('colors.zinc.100'),
						'--tw-prose-links': theme('colors.primary.400'),
						'--tw-prose-code': theme('colors.primary.300'),
						'--tw-prose-pre-bg': theme('colors.zinc.900'),
					},
				},
			}),
		},
	},
	plugins: [
		require('@tailwindcss/typography'),
	],
};
