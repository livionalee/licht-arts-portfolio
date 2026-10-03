# LichtArts Portfolio

A lightweight, responsive portfolio site inspired by the supplied LichtArts references, with interaction pacing informed by the long-form anchor flow on howardle.design.

## Included in this first rebuild

- Dark / light green theme switch with persistence
- Oversized editorial hero and CSS-generated art panels
- Low-cost hero carousel/parallax (transform-only + requestAnimationFrame)
- Desktop section rail + sticky navigation
- Smooth section flow: Home → Work → About → Process → Contact
- Filterable, data-driven project gallery
- Project detail modal
- Reveal-on-scroll via IntersectionObserver
- Responsive mobile/tablet layouts
- prefers-reduced-motion accessibility support
- No framework or runtime dependency: static HTML/CSS/JS works on GitHub Pages, Cloudflare Pages, Netlify, Vercel, or InfinityFree

## Run locally

Open index.html directly, or serve this folder with any static server such as `python -m http.server 8080`.

## Supabase / admin note

The public portfolio shell is intentionally static in this pass. For the editor/admin phase, use Supabase Auth + Row Level Security for authorization; a hidden route alone should never be treated as security. The local project data can later be replaced by a Supabase projects query without changing the card structure.

## Behance

Portfolio link: https://www.behance.net/louirodila
