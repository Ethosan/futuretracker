# Trade Journal brand guide

The look Trade Journal already has, read from the live app at v0.1.1 (charcoal · warm off-white · one lime · Syne and DM Mono). Full guide: [DESIGN.html](DESIGN.html). Open it from a checkout: it loads the repo's own icons by relative path.

| What | Where |
|---|---|
| Mark | `public/icon.svg` (source and favicon) and its PNGs in `public/` |
| Colours | `tokens.json` here, read from `src/style.css` (dark only) |
| Type | Syne (titles and numbers) and DM Mono (everything else), from Google Fonts |

Nothing in this folder is new artwork: every colour, font and file it names is already in the app.

## Repo avatar and social preview

| File | Where it's used |
|---|---|
| `docs/brand/avatar.png` | GitLab project avatar (Settings > General), 512×512 |
| `docs/brand/social-preview.png` | GitHub social preview (github.com/Ethosan/futuretracker, Settings > Social preview), 1280×640 |

Every one of these repos follows the same spec: a 512×512 PNG avatar with the project's own mark on its own background to every edge, since GitLab and GitHub round it themselves; and, for repos mirrored to GitHub, a 1280×640 social preview with the avatar tile, the name and the repo description, no URL. Both are made from the mark, not new artwork.
