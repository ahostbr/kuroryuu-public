# Theme Tuner Template

Use this template when the playground is about tuning Kuroryuu's visual theme: CSS variables, imperial mode toggle, color schemes, typography.

Extends the official `design-playground` template with Kuroryuu's actual CSS variable system.

## Layout

```
+-------------------+----------------------+
|                   |                      |
|  Controls:        |  Live preview        |
|  - Imperial toggle|  (mini Kuroryuu UI:  |
|  - Color sliders  |   sidebar, card,     |
|  - Typography     |   button, table,     |
|  - GenUI vars     |   terminal header)   |
|  - Spacing        |                      |
|                   +----------------------+
|                   |  Prompt output       |
|                   |  [ Copy Prompt ]     |
+-------------------+----------------------+
```

## CSS Variables to expose

### Core Theme Variables (from globals.css)

Read `apps/desktop/src/renderer/styles/globals.css` to get current values.

| Variable | Control | Default |
|----------|---------|---------|
| `--background` | Color picker | hsl(240, 10%, 3.9%) |
| `--foreground` | Color picker | hsl(0, 0%, 98%) |
| `--card` | Color picker | hsl(240, 10%, 3.9%) |
| `--primary` | Color picker | hsl(0, 0%, 98%) |
| `--secondary` | Color picker | hsl(240, 3.7%, 15.9%) |
| `--accent` | Color picker | hsl(240, 3.7%, 15.9%) |
| `--muted` | Color picker | hsl(240, 3.7%, 15.9%) |
| `--border` | Color picker | hsl(240, 3.7%, 15.9%) |
| `--radius` | Slider 0-24px | 0.5rem |

### GenUI Variables (--g-* scoped to .genui-root)

| Variable | Control | Standard | Imperial |
|----------|---------|----------|----------|
| `--g-bg` | Color picker | #0a0a0f | #0d0b07 |
| `--g-fg` | Color picker | #e2e8f0 | #d4c5a0 |
| `--g-accent` | Color picker | #60a5fa | #c5a03e |
| `--g-muted` | Color picker | #64748b | #8b7355 |
| `--g-card` | Color picker | #1e1e2e | #1a1508 |
| `--g-border` | Color picker | #2d2d3f | #3d3520 |
| `--g-crimson` | Color picker | #dc2626 | #8b0000 |
| `--g-success` | Color picker | #22c55e | #6b8e23 |

### Imperial Mode

Toggle that switches between standard dark theme and imperial theme:
- **Standard:** Modern dark, blue accent, clean sans-serif
- **Imperial:** Dark gold/crimson, serif fonts, scanline overlay

## Preview rendering

Render a mini Kuroryuu UI with these elements:
- Sidebar with 3-4 nav items (colored dots)
- Card component with title, text, metric
- Button (primary + secondary)
- Small table with 3 rows
- Terminal header bar
- Status badge

Apply CSS variables as inline styles so changes are instant.

## Presets

1. **Default Dark** — Current production theme
2. **Imperial Gold** — Full imperial mode (serif, gold, crimson, scanlines)
3. **Cyberpunk** — Neon accents, high contrast
4. **Ocean** — Blue-green palette, soft borders
5. **Monochrome** — Pure grayscale, no accent color

## Prompt output

Generate CSS variable overrides:

```
Update the Kuroryuu theme with these CSS variable changes:

:root {
  --background: hsl(220, 15%, 5%);
  --primary: hsl(210, 80%, 60%);
  --radius: 0.75rem;
}

.genui-root {
  --g-accent: #4fc3f7;
  --g-card: #1a2332;
}

Style direction: Modern dark with ocean-blue accents, medium border radius for a softer feel.
```

Only mention variables changed from defaults. Include qualitative description.
