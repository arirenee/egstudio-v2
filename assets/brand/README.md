# EG Studio brand assets

The approved logo is the legal page's `EG<span>STUDIO</span>` Montserrat wordmark. All visible wordmarks use the same `eg-wordmark` class, defined once in `assets/css/eg-wordmark.css`. EG uses the approved blue in dark mode and slate navy in light mode, with STUDIO in the corresponding neutral gray.

The browser and home screen icon is a simplified, joined EG monogram derived from those letterforms and colors. Its vector master is `/favicon.svg` (navy #142238, blue #6EA8E5, gray #9CA3AF). The solid one-color Safari mask is `/safari-pinned-tab.svg`.

Raster derivatives of the master are:

- `favicon.ico` (16, 32, and 48 pixels)
- `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png`, `favicon-64x64.png`, `favicon-128x128.png`, `favicon-256x256.png`
- `apple-touch-icon.png` (180 pixels)
- `android-chrome-192x192.png` and `android-chrome-512x512.png`

`site.webmanifest` references the Android icons. HTML pages consistently reference the icon family and the shared wordmark style. No runtime font is used by the icon itself.

The separate `share-preview.png` is an existing 1200 by 630 pixel marketing illustration; it is not the source for the product icon.
