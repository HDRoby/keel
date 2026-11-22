# Mock source files

These are the source files of the Keel clickable mockup, one per screen. Read them for structure, sizes, colours and copy.

- Layout and styles are inline `style="…"` attributes: read the values from there.
- `<x-import component-from-global-scope="SoftwareOneDesignSystem_52b182.X">` is a component from the design system the mockup uses (Navigation, Card, Button, Chip, Input, Icon, InlineNotification, Tabs). Build the matching Keel component from `docs/ui-guide.md` instead; do not copy the design system.
- `{{name}}` holes and the `<script type="text/x-dc">` block at the end show the sample data and the interactions (what happens on click, what is computed).
- `<sc-if>` and `<sc-for>` are the mockup's conditionals and loops.
- `canvas.json` lists the screens with their titles.
