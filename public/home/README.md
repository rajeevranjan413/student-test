# Home page images

Real Neeraj Competitive Classes photos used by the public landing page (`/`) and
the student home banner slider (F12, `/student`). Curated, web-named copies of the
originals in `../org/`. Each slot has a branded gradient fallback, so the page
always looks finished even if a file is missing.

| File               | Where it shows                                   |
|--------------------|--------------------------------------------------|
| `hero.jpg`         | Landing hero showcase + student slide 1          |
| `classroom.jpg`    | Landing gallery — class in session               |
| `banner.jpg`       | Landing gallery (large) + student slide          |
| `toppers.jpg`      | Landing gallery — toppers + student slide        |
| `felicitation.jpg` | Student banner slider                            |
| `teachers-day.jpg` | Student banner slider                            |
| `award.jpg`        | Student banner slider                            |

To swap a photo: replace the file (keep the name), or edit the `BANNERS` array in
`app/(protected)/student/page.tsx` / the `GalleryTile` src in
`app/(protected)/page.tsx`. Prefer landscape JPG/WebP optimized for web; slider
images look best around 1200×420 or wider.
