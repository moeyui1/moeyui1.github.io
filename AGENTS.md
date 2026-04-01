# Agent Guide — moeyui blog

## Project Overview

Personal blog of **moeyui** (不是很懂), built with **Astro 5** + **Tailwind CSS 3**, deployed to **GitHub Pages** via GitHub Actions.

- Site URL: `https://moeyui1.github.io`
- Deploy branch: `master`
- Build output: `dist/`

## Quick Commands

```bash
npm run dev      # Start dev server (localhost:4321)
npm run build    # Production build (~2.5s, 80 pages)
npm run preview  # Preview production build locally
```

## Project Structure

```
src/
├── content/blog/    # Blog posts (Markdown/MDX)
├── components/      # Astro components (Header, Footer, PostCard, etc.)
├── layouts/         # Page layouts (Base.astro, BlogPost.astro)
├── pages/           # Route pages (index, blog/, tags/, about, 404)
├── styles/          # global.css (Tailwind + animations)
├── consts.ts        # Site constants, PROJECTS array
└── content.config.ts # Content collection schema
public/
├── images/          # Static images (blogAvatar.jpg)
└── CNAME            # Custom domain file
```

## Writing a New Blog Post

### 1. Create a Markdown file

Create a new `.md` file in `src/content/blog/`. Use date-based naming: `YYYYMMDD.md` (e.g. `20260401.md`).

### 2. Front matter template

```yaml
---
title: "文章标题"
description: "一两句描述文章内容"
pubDate: 2026-04-01
tags:
  - tag1
  - tag2
---
```

**Required fields:**
- `title` — Post title (string)
- `pubDate` — Publish date (YYYY-MM-DD or full datetime). Also accepts `date` as alias.

**Optional fields:**
- `description` — Short summary shown on cards (defaults to `""`)
- `tags` — String or array of strings (defaults to `[]`)
- `updatedDate` — Last update date
- `abbrlink` — Legacy Hexo short link ID (not needed for new posts)

### 3. Write content

Use standard Markdown below the front matter. Supports:

- All standard Markdown syntax
- MDX (use `.mdx` extension) for component embedding
- Code blocks with Shiki syntax highlighting (themes: `github-light` / `github-dark`)
- Images: place in `public/images/` and reference as `/images/filename.jpg`

### 4. Preview and publish

```bash
npm run dev        # Preview at localhost:4321
npm run build      # Verify build succeeds
git add . && git commit -m "new post: title"
git push origin master   # Auto-deploys via GitHub Actions
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `astro.config.mjs` | Astro config (site URL, integrations, Shiki themes) |
| `tailwind.config.mjs` | Tailwind colors (primary=sky blue, accent=indigo), typography |
| `src/consts.ts` | `SITE_TITLE`, `SITE_DESCRIPTION`, `SITE_AUTHOR`, `PROJECTS[]` |
| `src/content.config.ts` | Zod schema for blog post front matter |
| `src/styles/global.css` | Animations (fadeInUp, float, pulseSlow, etc.), tech-grid |
| `src/pages/index.astro` | Homepage (hero, stats, tags, sidebar projects, recent posts) |
| `src/components/PostCard.astro` | Blog post card (featured + normal variants) |
| `src/layouts/BlogPost.astro` | Article page layout with prose styling |
| `.github/workflows/deploy.yml` | CI/CD: build + deploy to GitHub Pages on push to master |

## Adding a New Open Source Project

Edit `src/consts.ts` and append to the `PROJECTS` array:

```ts
{
  name: 'Project Name',
  description: 'Short description',
  url: 'https://...',
  icon: '🔧',           // Emoji icon
  tags: ['tag1', 'tag2'],
},
```

## Design System

- **Primary color**: Sky blue (`#0ea5e9` family) — used for links, accents, active states
- **Accent color**: Indigo (`#6366f1` family) — secondary accents
- **Dark mode**: Class-based toggle (`darkMode: 'class'`), light mode is default
- **Fonts**: Inter + Noto Sans SC (async Google Fonts), JetBrains Mono for code
- **Animations**: Defined in `src/styles/global.css` — `animate-fade-in-up`, `animate-float`, `animate-scale-in`, `animate-pulse-slow`, stagger delays (`stagger-1` through `stagger-8`)

## Constraints

- Node.js 22+ required
- No SSR — static output only (`output: 'static'`)
- No database or CMS — all content is file-based Markdown
- Deploy target is GitHub Pages (no server-side features)
