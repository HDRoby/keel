# Interaction states

The mockup's component library sets these in JavaScript (on hover, focus and press), so they are not in `keel-components.css`. Values are the tokens in `keel-tokens.css`.

| Component | Rest | Hover | Focus / active | Disabled |
| --- | --- | --- | --- | --- |
| Button `primary` | background and border `--brand-primary`, text white | background and border `--alerts-info-3` | keyboard focus: `box-shadow: var(--box-shadow-3)` | text `--gray-4`, background `--gray-2`, border transparent |
| Button `secondary` | background and border `--alerts-info-1`, text `--brand-primary` | background and border `--brand-primary`, text white | as primary | as primary |
| Button `outline` | background white, border and text `--brand-primary` | background `--alerts-info-1` | as primary | as primary |
| Button `text` | transparent, text `--brand-primary`, padding 7px 8px | background `--alerts-info-1` | as primary | text `--gray-4`, transparent |
| Button `danger` colour | same pattern with `--brand-danger`, hover `--alerts-danger-3`, tint `--alerts-danger-1` | | | |
| Button (all) | padding 7px 15px, radius `--radius-m` (8px), border 1px solid, **font-weight 400**, 14/20 | | | |
| Input, Select, textarea | border 1px `--gray-4`, radius `--radius-m`, padding 8px 16px, text `--brand-type`, background white | border `--brand-primary` | border `--brand-primary`, `box-shadow: var(--focus-default)` | background `--gray-2` |
| Input error / success | border `--alerts-danger-3` / `--brand-success`; message 12/14.4 in `--brand-danger` | | | |
| Side menu item | text `--gray-6`, transparent | background `--gray-1` | active: text `--brand-primary`, 4px blue bar on the left (radius 8px), group heading blue | |
| Card (`hoverable`) | `--box-shadow-1` | `--shadow-card-hover` | | |
| Link | `--brand-primary`, no underline | `--alerts-info-3`, underline | | |
| Grid row | background white | background `--gray-1` | selected: background `--alerts-info-1` | |
| Option card (mock pattern) | white, border `--gray-2` | — | selected: background `--alerts-info-1`, border `--brand-primary` | |

Transitions: `--transition` (all 0.1s linear) on buttons and menu items.
