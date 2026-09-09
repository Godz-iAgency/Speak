# Speak brand assets

Source: a single moodboard image generated in ChatGPT (`reference/speak-full-moodboard-original.png`, 1254×1254px). The individual pieces below are cropped straight out of that file with Python/Pillow — nothing was regenerated or redrawn.

## Picks

**App icon → `icon/speak-icon-gradient-PRIMARY.png`**
The violet-to-pink gradient tile. It's the one that still reads at 16–32px: a single saturated color block with a bold white glyph, no card-on-a-card look like the white-bg and dark-bg variants get when the OS drops its own rounded mask on top. This is the one to use for the taskbar/dock icon, PWA manifest, and app store listing.

**Logo lockup (light backgrounds) → `logo/speak-logo-horizontal.png`**
Icon + "speak." wordmark + tagline, for anywhere the background is light: README header, marketing site, docs. `logo/speak-icon-tile-white.png` is the same lockup in a compact square card if you need a boxed version instead of the wide one.

**Everything else** (`icon/speak-icon-dark.png`, `icon/speak-icon-white.png`, `marketing/*`, `reference/speak-color-swatches.png`) is kept as reference/backup — usable, just not the primary picks.

**`reference/speak-recording-widget-style-ref.png`** isn't a real asset — it's the recording control bar from the moodboard, kept purely as a style reference. It already matches the dark rounded bar with a big center record button I built for [RecordingBar.tsx](../../SplitMic-full-app/src/components/RecordingBar.tsx) in the SplitMic app; if Speak reuses that component, restyle it to match this rather than embedding the picture.

## The one real limitation: resolution

The source moodboard is 1254×1254px total, shared across 9 separate elements. That means every crop is small — the icon files are ~245–310px per side. Fine for a README badge, a browser tab favicon, or wiring up the UI while building. **Not** fine for an actual app icon submission (App Store / Play Store / a crisp PWA manifest all want a 1024×1024 master) or a favicon that needs to look sharp at multiple sizes — a flat photo has no transparency and can't be upscaled cleanly.

`icon/speak-icon-glyph-placeholder-LOWRES.png` is the roughest of the bunch — I cropped it down to just the glyph with no wordmark for favicon use, but it's cut close and file name says LOWRES on purpose. Treat it as a placeholder, not a shipping asset.

## Regenerating clean, production-size versions

When you're ready for real assets, paste these into ChatGPT one at a time. Each is written to produce one isolated subject on a transparent background at high resolution — that's what cropping this moodboard can't give you.

**1. App icon, 1024×1024, transparent**
```
Create a single square app icon, 1024x1024px, transparent background. A rounded-square gradient tile (violet #7C3AED to pink #EC4899, 135-degree diagonal) containing a simple white glyph: a speech bubble merged with a video-camera play shape, with two small motion/sound tick marks above it (matching this reference icon: a chat bubble containing a sound-wave/mic glyph, overlapping a camera-lens triangle). Bold, flat, minimal — no text, no wordmark, no drop shadow, no mockup frame. Vector-style icon design, not a photo.
```

**2. Wordmark logo, transparent, for light and dark use**
```
Create a horizontal logo lockup on a fully transparent background, high resolution (at least 2000px wide). Left: the Speak icon (rounded gradient tile, violet #7C3AED to pink #EC4899, with a white speech-bubble + video-camera glyph and two motion tick marks above it). Right: the wordmark "speak." in a bold, rounded, geometric sans-serif, all lowercase, with the trailing period rendered as a small gradient dot (violet to pink). Text color #0B1020 (near-black). No background shape, no shadow, no mockup — just the icon and text on transparency so it can sit on any color page.
```

**3. Favicon-ready icon, 512×512, transparent, simplified**
```
Create a single square icon, 512x512px, transparent background, optimized to stay legible at 16x16px (favicon size). A gradient rounded-square tile (violet #7C3AED to pink #EC4899) with a bold, simplified white glyph: a speech bubble overlapping a video-camera play shape. Remove fine detail (no separate tick marks, no thin strokes) — thicken every shape so it holds up at tiny sizes. Flat vector icon style, no shadow, no text.
```

**4. Social share / Open Graph image, 1200×630**
```
Create a 1200x630px social share image for an app called "Speak" (a screen recorder with a built-in trim editor). Dark midnight background (#0B1020). Centered: the Speak logo (gradient violet-to-pink rounded icon with a white speech-bubble + camera glyph, plus the wordmark "speak." in bold white lowercase with a gradient dot after it) and the tagline "Record. Share. Be Heard." below it in a muted light gray. Clean, modern, minimal — no UI mockups, no clutter, generous negative space.
```

Save whatever comes back into this same `brand/` folder structure (`icon/`, `logo/`, etc.) using the naming pattern already here, and I'll wire them into the app.

## Colors

Extracted into [`tokens/colors.css`](tokens/colors.css) as CSS custom properties.

| Name | Hex | Role |
|---|---|---|
| Midnight | `#0B1020` | Background |
| Violet | `#7C3AED` | Primary |
| Pink | `#EC4899` | Accent |
| Cyan | `#06B6D4` | Accent |
| Orange | `#F97316` | Highlight |
| Cloud | `#F8FAFC` | Surface |

## File manifest

```
brand/
├── icon/
│   ├── speak-icon-gradient-PRIMARY.png      ← app icon pick
│   ├── speak-icon-dark.png                  (alt, dark-bg card)
│   ├── speak-icon-white.png                 (alt, white-bg card)
│   └── speak-icon-glyph-placeholder-LOWRES.png  (rough favicon placeholder — regenerate before shipping)
├── logo/
│   ├── speak-logo-horizontal.png            ← lockup pick, light backgrounds
│   └── speak-icon-tile-white.png            (boxed alt of the same lockup)
├── marketing/
│   ├── speak-quote-card.png
│   └── speak-tagline-stack.png
├── reference/
│   ├── speak-color-swatches.png
│   ├── speak-recording-widget-style-ref.png (style reference only, not an asset)
│   └── speak-full-moodboard-original.png    (the untouched source ChatGPT image)
└── tokens/
    └── colors.css
```
