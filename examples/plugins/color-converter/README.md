# Color Converter

Example oh-my-select plugin for selected CSS color values.

## Supported Inputs

- HEX: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`
- RGB/RGBA: decimal channels from `0` to `255`, comma or modern space syntax, optional alpha as `0`-`1` or a percent
- HSL/HSLA: numeric hue, saturation and lightness percentages, comma or modern space syntax, optional alpha as `0`-`1` or a percent
- OKLCH: decimal lightness from `0`-`1`, non-negative chroma, and hue channels, optional alpha as `0`-`1` or a percent

HEX matching is case-insensitive. HEX output is uppercase.

## Try These Values

```text
#fff
#FFFF
#22c55e
#22C55Ecc
rgb(34, 197, 94)
rgba(34, 197, 94, .8)
rgb(34 197 94 / 80%)
hsl(142 71% 45%)
hsla(142, 71%, 45%, .8)
oklch(0.72 0.19 149.6)
oklch(0.72 0.19 149.6 / .8)
```

## Manual Check

1. Run the app with `bun run tauri dev`.
2. Open Settings from the tray.
3. Import this folder.
4. Select one supported value in another application.
5. Confirm the popup shows a swatch and HEX, RGB, HSL, and OKLCH rows.
6. Click each copy button and confirm the row reports `Copied`.
