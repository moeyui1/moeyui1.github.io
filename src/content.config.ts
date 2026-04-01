import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		title: z.string(),
		description: z.string().optional().default(''),
		// Support both Hexo 'date' and Astro 'pubDate'
		date: z.coerce.date().optional(),
		pubDate: z.coerce.date().optional(),
		updatedDate: z.coerce.date().optional(),
		tags: z.union([z.string(), z.array(z.string())]).optional().default([]).transform((val) => {
			if (typeof val === 'string') return [val];
			return val;
		}),
		abbrlink: z.string().optional(),
	}).transform((data) => ({
		...data,
		pubDate: data.pubDate || data.date || new Date(),
	})),
});

export const collections = { blog };
