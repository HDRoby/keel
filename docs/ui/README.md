# Keel UI reference: styles from the mockup

Use these files to make Keel look exactly like the clickable mockup. They were measured from the mockup on 2026-11-22.

| File | What it is | How to use it |
| --- | --- | --- |
| `keel-tokens.css` | Every colour, type, spacing, radius and shadow token the mockup uses, with the same names as the `var(--…)` references in `docs/mocks/source/*.dc.html` | Replace the variables in `src/app/globals.css` with these. Keep the names. |
| `keel-components.css` | Computed styles of each component the screens use (side menu, header bar, card, buttons, tags, notices, inputs, select, toggle, tabs, switcher, table, icon), recorded element by element | The values for each component in `src/components/ui/`. Class names follow the element tree (`.k-button-primary-0` is the first child of the primary button). Copy values; do not import the file. |
| `components.html` | The same components rebuilt from the two CSS files only, with the markup that goes with each class | Open it in a browser next to the app. Each Keel component should look the same. |
| `states.md` | Hover, focus, active and disabled states, which the CSS file cannot capture | Add these to each component. |
| `mock-style-inventory.md` | Every inline style value used in the mock screens, counted | Check that Keel uses the same scale (font sizes, colours, gaps, radii). |

## Why the app looks slightly different today

Compared with `src/app/globals.css` as built in v0.1:

| Property | App today | Mockup |
| --- | --- | --- |
| Body text | 15px / 1.5 | 14px / 20px |
| Text colour | `#1b1d21` | `#25282d` (`--gray-6`); titles `#000` |
| Muted text | `#646a73` | `#6b7180` (`--gray-4`); secondary `#434952` |
| Accent | `#2f6fec` | `#3366ff` (`--brand-primary`); hover `#2447b3` |
| Accent soft | `#eaf0fd` | `#ebf0ff` (`--alerts-info-1`) |
| Page background | `#f4f5f7` | `#f4f6f8` (`--gray-1`) |
| Borders | `#e2e4e8` | `#e0e5e8` (`--gray-2`); inputs `#6b7180` |
| Card radius and shadow | 12px, custom shadow | 16px, `--box-shadow-1` |
| Buttons | weight 500, padding 8px 16px | weight 400, padding 7px 15px, radius 8px |
| Page title (h1) | 26px | 24px / 28.13px, weight 700 |
| Card title (h2) | 19px | 18px / 26px, weight 500 |
| Success / warning / danger | `#1d7a49` / `#a55600` / `#b4322a` | `#008556` / `#a15d26` text on `#fdf2e9` / `#dc182c` (text `#bb1425`) |
| Icons | own SVG set | Material Symbols Outlined |

## Font

The mockup uses a licensed brand font, which Keel must not ship. `--font-body` is the system font stack; sizes, weights and line heights stay the same.

## Icons

Material Symbols Outlined (Apache 2.0). Keel runs locally and may be offline, so self-host it, for example with the `material-symbols` npm package, rather than loading Google Fonts.
