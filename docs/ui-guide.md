---
project: PRJ-0001
title: Keel UI guide
updated: 2026-11-22
source: Keel clickable mockup (docs/mocks/), CR-0004 to CR-0008
---

# Keel UI guide

Every screen is built from the parts below. If a screen needs something that is not here, add it here first, then build it once in `src/components/ui/`.

The mockup uses a company design system for its look. Keel uses the same layout, sizes and colours with the system font and no company branding.

## Tokens

Exact values are in `docs/ui/keel-tokens.css` (tokens) and `docs/ui/keel-components.css` (components), measured from the mockup. Where this table differs, those files win. The table below names the roles.

Put these in `src/app/globals.css` as CSS variables and use only the variables in components.

### Colour

| Token | Value | Use |
| --- | --- | --- |
| `--text-strong` | `#000000` | Headings, field values, names |
| `--text` | `#25282d` | Body text |
| `--text-secondary` | `#434952` | Descriptions, comment text |
| `--text-muted` | `#6b7180` | Meta lines, labels, hints |
| `--accent` | `#3366ff` | Primary buttons, links, active stage, focus |
| `--accent-strong` | `#2447b3` | Link hover, text on accent-soft |
| `--accent-soft` | `#ebf0ff` | Selected card, active stage, suggestion backgrounds |
| `--bg` | `#f4f6f8` | Page background, locked stage |
| `--surface` | `#ffffff` | Cards |
| `--surface-muted` | `#f6f7f9` | Notes, status lines, metadata blocks, table header |
| `--border` | `#e0e5e8` | Card and row borders |
| `--border-strong` | `#b6bcc6` | Inputs, dashed suggestion borders |
| `--ok` | `#008556` | Done, Looks good |
| `--ok-text` | `#1a7f43` | Text on ok-soft |
| `--ok-soft` | `#e6f6ec` | Decided, Written, success notices |
| `--warn` | `#e5a000` | Challenge border, To decide |
| `--warn-text` | `#8a5a00` | Text on warn-soft |
| `--warn-soft` | `#fff4e0` | Warning notices, Challenged, Conflict |
| `--danger` | `#b42318` | Delete, missing required, conflicts with |
| `--danger-soft` | `#fdecea` | "No scenario yet", error notices |
| `--link` | `#7b4fd6` | "Links sections" comments |
| `--link-text` | `#5b34b0` | Text on link-soft |
| `--link-soft` | `#f7f3ff` | "Links sections" background |
| `--handoff` | `#6b3fb3` on `#f3ecff` | "At handoff" tag |
| `--code-bg` | `#1e1f24` with text `#e6e8ec` | Terminal and Markdown source blocks |

### Type

System font stack; monospace for paths, IDs and code.

| Name | Size / line height | Weight | Colour |
| --- | --- | --- | --- |
| Page title (h1) | 24 / 28 | 700 | `--text-strong` |
| Card title (h2) | 18 / 26 | 500 | `--text-strong` |
| Section title (h3) | 16 / 19 | 500 | `--text-strong` |
| Body | 14 / 20 | 400 | `--text` |
| Small | 13 / 19 | 400 | `--text-secondary` |
| Meta | 12 / 14.4 (16 in rows) | 400 | `--text-muted` |
| Overline (comment kind) | 11 / 14, uppercase | 600 | the kind's text colour |
| Mono | 12 / 18 | 400 | `--text-strong` |

### Space, radius, shadow

- Spacing scale: 4, 6, 8, 12, 16, 20, 24. Page padding 24. Gap between cards 24. Inside a card 16 (20 for long forms).
- Radius: cards and stage bar 16; buttons, inputs, notices, inner boxes 8; tags 999; small inner rows 6.
- Card shadow: `0 1px 3px rgba(107,113,128,.2), 0 1px 16px rgba(107,113,128,.1)`. No other shadows except the focus ring.
- Focus and "active section" ring: `border: 1px solid var(--accent); box-shadow: 0 0 0 3px var(--accent-soft)`.

## Shell

- **Side menu** (left, about 256 px, white, full height): "Keel" brand (18/26, 700), then groups with an icon heading:
  - **Project · <title>**: Project setup, Explore, Intent, Spec, Plan, Handoff, Roadmap, Changes.
  - **Library (.keel)**: Templates, Brainstorm styles, Standards.
  - **Settings**: Settings.
  - Active item: accent text and a 3 px accent bar on the left.
- **Header bar** (top of the content, white, bottom border): page title, and a subtitle "Keel · <folder path>".
- **Content**: padding 24, `max-width: 1400px`, cards stacked with gap 24. Forms that are read top to bottom (Initialise, Explore) are centred with `max-width: 900px`.
- Before initialisation the menu has only **This folder · Initialise**.
- In setup mode (a startup check failed, CR-0012) the menu has only **Setup**: Startup check, Settings, and Project setup when the project config is the problem; the project group is shown locked.

## Page header

A row that wraps: left side has the project title (h1), a meta line ("PRJ-0001 · intent.md · INT-0001") and, where it applies, a "Project setup" link with an edit icon and the description in muted text below. Right side has the page actions: at most one primary button, plus outline buttons. A disabled primary button keeps its label (for example "Draft intent.md").

## Components

Build each once in `src/components/ui/` and use it everywhere.

| Component | Look | Used on |
| --- | --- | --- |
| `Card` | White, radius 16, card shadow, padding 24, title (h2) and optional meta line under it, optional actions on the right | Every page |
| `StageBar` | White bar, radius 16, card shadow, padding 8, gap 8. Each stage: min-height 56, radius 8, icon + label (14/20, 500) + note (12/14.4). Active: accent-soft background, accent border and text, `radio_button_checked` icon. Done: transparent, ok `check_circle`. Out of date: warn `error` icon, note "Out of date · …". Locked: `--bg`, dashed `#aeb1b9` border, lock icon, muted text, note says what unlocks it | Explore, Intent, Spec, Plan, Handoff |
| `Button` | Min-height 36, padding 7 × 15, radius 8, 14/20, 500. `primary` accent fill, white text. `outline` white, border `--text-muted`. `secondary` accent-soft fill, accent text. `text` no border, accent text. `danger` variants use `--danger`. Small: min-height 28 | Everywhere |
| `LinkButton` | Text only, 12/16, 500, accent (muted for Clear/Dismiss/Cancel, danger for Delete) | Inline actions: Apply, Accept, Clear, Undo, Edit, Change, Show |
| `Tag` | 12/16, padding 1 × 8, radius 999, soft background with matching text colour | Status: Required/Optional (plain muted text, no pill), Suggested, Yours, New, Edited, Decided · ADR-xxxx, To decide, Conflict, Written, Now / As you approve / At handoff |
| `Notice` | Radius 8, soft background of its kind, icon, title (500) and text; kinds info, success, warning, danger | Approval, conflicts, "Intent v2 is approved", "Not a git repository yet" |
| `StatusLine` | `--surface-muted` box, radius 8, padding 8 × 12, a coloured dot (pulsing while busy) and one line of meta text; optional legend on the right | Explore review status, coverage lines in Spec |
| `ProgressLine` | Label "3 of 4 required filled", 6 px bar (accent, ok when complete), meta note under it | Explore |
| `Field` | Label, Required/Optional in muted text, input, hint. Inputs: border `--border-strong`, radius 8, padding 8 × 12, 14/20. Suggested values are italic at 85 % opacity with "Accept · Clear" under the field | Initialise, Explore, Settings, Spec |
| `SectionField` | A bordered box (radius 10, padding 14 × 16) holding: header row (status icon, label, Required/Optional, Reviewing…, New comment tag), a `Comment` above the input, the input. Focused: active ring | Explore |
| `Comment` | Left border 3 px and soft background in the kind's colour, radius 6, padding 12 × 14. Overline with the kind (Challenge, Links sections · <section>, Suggestion, Question, Looks good), text 14/21 with **bold** section names, optional proposed text in a white dashed box with "Apply · Dismiss", reply thread, reply input "Reply to the assistant and press Enter". Collapsed: one-line preview with "Show" | Explore |
| `OptionCard` | Button-like card, radius 8, padding 12, border `--border`; selected: accent-soft background and accent border. Title (14/20, 600), optional "Recommended" tag, summary (13/18), "+ advantage" in ok text, "− drawback" in warn text, fit line (ok or danger, 12/16, 500), "Serves REQ-…" meta | Initialise (templates, styles, kit, standards), Spec Design |
| `ListRows` | Rows with an ID label (mono 12, 80 px wide; "new" or "suggested" in italics before an ID exists), a single-line input, move-up and remove icon buttons, "+ Add …" link under the list | Explore Requirements |
| `ScenarioCard` | View: name (500), tag, Edit link, steps with keyword (48 px column, accent, 500) and text. Edit: name input, rows of keyword select + text input + remove, "+ Add step", "Delete scenario", Done | Spec scenarios |
| `Tabs` | Inline tabs under the card top; counts in a small pill | Intent, Spec |
| `Segmented` | Two or three options in a `#f0f2f5` pill, selected option white with a light shadow | Rendered / Markdown, Preview / Gherkin |
| `FileTree` | Grid of path / what it is for / when; rows 6 × 16 padding, alternating `#fcfcfd`; folders bold with a chevron and a file count when closed, start closed; colour dot per kind with a legend | Initialise, Handoff |
| `CodeBlock` | `--code-bg`, radius 8 (12 for terminal), padding 16 × 20, mono 12/19, `white-space: pre-wrap` | Markdown source, Gherkin, terminal |
| `DataTable` | Header row on `--surface-muted`, 12/16 muted 500; rows 14/20 with `--border` dividers | Requirements, versions, impact |
| `MetaGrid` | `--surface-muted` box with key/value pairs (key muted, value mono or 14/20) | Intent and Spec headers |
| `ChatComposer` | Not used any more on Explore (CR-0005); keep only if another page needs it | — |

## Page patterns

- **Document page** (Intent, Spec, Plan): page header, StageBar, a two-column row that wraps: main card (`flex: 999 1 560px`) with Tabs, and a side column (`flex: 1 1 380px`) with Approval, Version history, Mock references cards. A muted note at the top of the main card says where the content comes from and how to change it.
- **Section form** (Initialise, Explore): centred column, max 900 px, grey "Template · Style" line above the main card, StatusLine and legend at the top of the card, one `SectionField` or option group per block, a muted footer note.
- **Library page** (Templates, Brainstorm styles, Standards): page header with the folder path (".keel/templates"), groups by kind with a "Create" button per group, list on the left and the selected item on the right; "Back to <origin>" bar when opened from another page.
- **Settings**: two headed sections, "You, on this computer" (path `~/.config/keel`) and "This project" (path `.keel/config.yml`), each with its cards.

## Screen checklist

For each screen, compare with `docs/mocks/set-1/<screen>.png` and the source in `docs/mocks/set-1/source/<Screen>.dc.html`.

| Screen | Route | Mock source | Must have |
| --- | --- | --- | --- |
| Open Keel (terminal) | CLI | `Main.dc.html` | CLI output lines as shown |
| Initialise | `/` | `Start.dc.html` | "What Keel found" for the four cases, paths, opt-in file list, agent files and rules, folder card, "What Keel creates" with collapsible FileTree, option cards, primary "Initialise and start brainstorm" |
| Project setup | `/setup` | `SetupKeel.dc.html` | Same cards as Initialise, saves to `.keel/config.yml` |
| Explore | `/explore` | `NewIdea.dc.html` (early), `Explore.dc.html` (later) | SectionFields with Comments, StatusLine, ProgressLine, Requirements ListRows, no chat panel |
| Intent | `/intent` | `Intent.dc.html` | Assembled-from-Explore note, Tabs (Preview, Markdown, Mock references), Approval, Version history |
| Spec | `/spec` | `Spec.dc.html` | Tabs: Requirements, Design (decision OptionCards), Acceptance scenarios (ScenarioCards by requirement), Flagged concerns, Clickable mock (prompt pack, drop area, mock sets); Feasibility and Decision |
| Plan | `/plan` | `Plan.dc.html` | Versions, diff, impact, tasks |
| Handoff | `/handoff` | `Handoff.dc.html` | FileTree with states, "Write to folder", conflict Notice, optional Push, Read-back card |
| Changes | `/changes`, `/changes/[id]` | `ChangesList.dc.html`, `Changes.dc.html` | List read from changes/ with computed status and Next to apply; request page with what changed, approval, impact by requirement, change package (CR-0003) |
| Roadmap | `/roadmap` | `Roadmap.dc.html` | Now (read-only), Next, Later, Not doing collapsed, "Start in its own folder" |
| Templates, Styles, Standards | `/templates`, `/styles`, `/standards` | same names | Library page pattern |
| Settings | `/settings` | `Settings.dc.html` | Two sections as above |
| Startup check | `/check` | `Startup.dc.html` | Check rows with OK, Needs fixing or Waiting; warning notice; setup-mode menu (CR-0012) |
| Stage bar | component | `StageBar.dc.html` | All states |
