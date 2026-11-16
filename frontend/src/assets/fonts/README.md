# Bundled fonts

| File | Covers | Size |
|---|---|---|
| `Jersey10-latin.woff2` | latin | 13 KB |
| `Jersey10-latin-ext.woff2` | latin extended | 10 KB |
| `fusion-pixel-12px-proportional-zh_hans.ttf.woff2` | GB/T 2312 han + the shipped locales | 224 KB |

## The CJK face

[Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font) (SIL OFL 1.1, see
`licenses/`), 12px proportional, Simplified Chinese build. The upstream file carries
38,213 code points (19,546 han) at 936 KB; the one bundled here is subset to 7,059.

Subsetting keeps the glyph outlines byte-for-byte, so the pixel style is identical to
upstream — only the unused glyphs are gone. The upstream copyright line declares no
Reserved Font Name, so the subset keeps the family name.

### Why GB/T 2312 and not just the UI strings

The translations only use 765 CJK characters, which subsets to 31 KB. That is not
enough: episode names, folder names, file paths and Scene Scout queries are the
user's own text, and anything outside the subset renders as a tofu box. GB/T 2312
(6,763 han) covers everyday Simplified Chinese, including characters as rare as
饕餮鬻爨, for 224 KB.

| Coverage | Code points | Size | Safe for user text |
|---|---|---|---|
| UI strings only | 870 | 31 KB | no |
| **GB/T 2312 + locales** | **7,059** | **224 KB** | **yes** |
| GBK + locales | 21,308 | 583 KB | yes, incl. rare names |
| upstream, unsubset | 38,213 | 936 KB | yes |

The `@font-face` rule that uses this file sets a `unicode-range` over the CJK blocks,
so the file is only fetched when Chinese text actually renders.

## Regenerating

```bash
pip install "fonttools[woff]" brotli
python scripts/build-cjk-font.py <upstream-fusion-pixel.woff2>
```

The script unions the chosen coverage with every character found in
`src/i18n/locales/*/*.json`, so a translation that adds a rare character keeps
working as long as the font is rebuilt. It warns about any character the source
font itself lacks: the upstream zh_hans build is missing 36 of GB/T 2312's own han.

Coverage is `auto` by default, which means GB/T 2312 today and Big5 as soon as a
traditional locale (`zh-TW`, `zh-HK`) appears under `locales/`. `crowdin.yml`
already maps zh-TW, so that day is coming.

### zh-TW needs a different source font

GB/T 2312 is simplified only. Big5 adds 8,678 han on top of it, and the upstream
**zh_hans** build does not have 822 of them, so a traditional locale set in the pixel
font would show tofu whatever the subset does. Fusion Pixel publishes a `zh_hant`
build; that is the file to subset for zh-TW, either as a second `@font-face` with its
own `unicode-range` or as a merged source. Widening the subset alone is not enough.

| Coverage | Code points | Size |
|---|---|---|
| GB/T 2312 + locales (today) | 7,066 | 224 KB |
| Big5 + GB/T 2312 + locales | 14,961 | 459 KB |

## Replacing the face

A candidate must drop into the same `@font-face` without reflowing the app. The
numbers it has to match are in `scripts/cjk-font-spec.json`, taken from the bundled
file: a 1200 unit em on a 100 unit pixel grid, a 1200 unit han advance, ascent 1300 /
descent −300, and proportional latin (A 800, i 400, space 600). Every one of the
167,038 outline points in the bundled face sits on that grid with no off-curve point,
which is what makes it read as pixels.

```bash
python scripts/check-cjk-font.py <candidate.otf>
```

It reports the metrics that differ, the code points missing against
`scripts/cjk-font-coverage.txt`, and any outline point off the grid. Exit code 0 means
drop-in. For the eye rather than the numbers, open `scripts/font-proof.html` over a
local server and load the candidate: it sets the app's own strings next to the bundled
face, with a smoothing-off pixel grid at the bottom.

```bash
cd frontend && python -m http.server 8777
# then open http://127.0.0.1:8777/scripts/font-proof.html
```

The `@font-face` and the `--cjk-fallback` stack live in `src/styles/variables.css`;
`settingsStore.ts` pairs this face with Jersey 10 in `JERSEY_FONT_STACK`, so it is
only fetched when a reader picks the pixel font *and* renders CJK text. It still
ships inside every build, which is what the subset is for.
