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
working as long as the font is rebuilt. Pass `--coverage gbk` to widen it.
