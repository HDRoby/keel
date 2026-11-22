---
project: PRJ-0001
---

# Mock sets

Each mock set is the exported screens of a clickable mock, made from one spec version. The current set shows intent; the spec decides. When the spec gets a new version, a set made from an earlier one is out of date until a new set replaces it. Older sets stay here as history.

| Set | Made from | Exported | Screens | Status |
| --- | --- | --- | --- | --- |
| [set-1](set-1/) | spec v11 | 2026-11-22 | 17 PNG, screen sources in `set-1/source/` | Current |

## Set 1

Exported from the Keel clickable mockup on 2026-11-22, after the owner's review that produced CR-0004 to CR-0008. Interactive screens are shown in their starting state. The screen sources (`set-1/source/*.dc.html`) have the exact structure, sizes and copy: read them first. `docs/ui-guide.md` has the tokens, components and a checklist per screen.

| File | Screen | Requirements |
| --- | --- | --- |
| [Keel clickable mockup](https://claude.ai/artifact/2c9B2cJWe7LErc2QAAAMvP) | Live canvas (private to the owner) | All screens |
| `1 · Open Keel on a folder (npx keel).png` | Opening Keel on a folder from the terminal | REQ-012 |
| `1b · Initialise this folder (.keel).png` | Initialise: title, templates, style, standards, and what Keel creates in the folder | REQ-012, REQ-001, REQ-003, REQ-011 |
| `1d · Project setup for Keel (opened from 2 · Explore).png` | Project setup | REQ-012 |
| `2b · Explore sections with live comments (early stage).png` | Explore at the start: template sections with live comments | REQ-001 |
| `2 · Explore sections with live comments (later).png` | Explore later on | REQ-001, REQ-002 |
| `3 · Intent.png` | Intent: preview, metadata, mock references, approval, history | REQ-002, REQ-010 |
| `4 · Spec requirements, design decisions, scenarios, feasibility.png` | Spec | REQ-004, REQ-005, REQ-013 |
| `5 · Plan, versions and impact.png` | Plan, versions and impact | REQ-004, REQ-008 |
| `6 · Handoff into this folder and read-back from local git.png` | Handoff into the folder, optional push, read-back | REQ-006, REQ-007 |
| `6b · Change request and approval (CR-0003).png` | Change request and approval (Next on the roadmap) | CR-0003 |
| `6c · Roadmap (Now, Next, Later, Not doing).png` | Roadmap | Roadmap |
| `7 · Templates.png` | Template library | REQ-003 |
| `7b · Brainstorm styles.png` | Brainstorm styles | REQ-011 |
| `7c · Standards (conventions and guidelines).png` | Standards | REQ-012 |
| `8 · Settings (you on this computer · this project).png` | Settings, split into this computer and this project | REQ-009, REQ-012 |
| `Component · Stage bar.png` | Stage bar component | REQ-005 |
| `1b · Initialise new, Keel, existing and existing-with-AI folders.png` | Initialise for the four opening cases (CR-0010) | REQ-012 |

Keel uses the mockup's layout, sizes and colours with the system font and no company branding. `1b · Initialise this folder (.keel).png` predates the four opening cases of CR-0010; the source `set-1/source/Start.dc.html` is current.
