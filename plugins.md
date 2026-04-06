# Plugins

nodepad supports **included plugins**: optional features can live in the repo, but stay **disabled by default** so a fresh clone of `main` behaves like the core app.

This is the first step of the plugin system. It is intentionally simple:

- plugins are normal source files in the repo
- plugin manifests and modules are discovered from the filesystem at startup
- a generated registry wires detected plugin modules into the app bundle
- users enable or disable detected plugins from the existing Settings panel
- disabled plugins stay hidden from the command palette and the default UI

This means someone can clone `main`, run the stock app, and only opt into extra features when they want them.

Plugin actions can now do more than export: they can also append parsed blocks into the active project via the plugin action context. This keeps project creation and import routing in core, while still allowing optional importers.

## Default behavior

With optional plugins disabled, nodepad exposes the core feature set only:

- `Tiling`
- `Kanban`
- `Graph`
- standard exports: `.nodepad` and Markdown

Optional views and exports stay hidden until enabled.

## Plugin discovery

Plugins are discovered from:

```text
plugins/*/plugin.json
plugins/*/plugin.ts or plugins/*/plugin.tsx
```

On `npm run dev` and `npm run build`, nodepad runs:

```text
npm run generate:plugins
```

That script scans the `plugins/` directory and regenerates:

```text
lib/generated-plugin-registry.ts
```

So the practical workflow is:

1. Add or change plugin files under `plugins/<id>/`
2. Restart the app
3. Open Settings → Plugins
4. Enable the plugin

Example manifest:

```ts
{
  "id": "blockscape",
  "label": "Blockscape",
  "description": "Structured graph view plus Blockscape JSON export",
  "enabledByDefault": false
}
```

## Included example: Blockscape

`Blockscape` is the reference included plugin.

When enabled, it adds:

- the `Blockscape` view to the `⌘K` command palette
- the `Export → blockscape` action to the `⌘K` command palette
- the Blockscape renderer and detail panel
- the Blockscape JSON export format

Key files:

- `plugins/blockscape/plugin.json`
- `plugins/blockscape/plugin.tsx`
- `plugins/blockscape/graph2-area.tsx`
- `plugins/blockscape/graph2-detail-panel.tsx`
- `plugins/blockscape/export.ts`
- `lib/plugins.ts`
- `lib/use-plugins.ts`
- `lib/generated-plugin-registry.ts`
- `scripts/generate-plugin-registry.mjs`

## How to enable Blockscape

1. Start nodepad normally.
2. Open the sidebar.
3. Open `Settings`.
4. Scroll to the `Plugins` section.
5. Turn on `Blockscape`.

After enabling it, you will see:

- `Blockscape` in the view list in `⌘K`
- `Export → blockscape` in the actions list in `⌘K`

## Included example: Markdown Import

`Markdown Import` is a lightweight action-only plugin.

When enabled, it adds:

- `Import → markdown` to the `⌘K` command palette
- a multi-file picker for `.md` and `.markdown` files
- frontmatter-aware mapping into core nodepad blocks in the active project

It does not create a new project. It appends imported notes into the current one.

## How to disable it again

Open `Settings` and turn `Blockscape` off in the `Plugins` section.

## Current scope

This is now a **generated registry plugin system**, not a fully dynamic runtime plugin loader.

Today, the intended workflow is:

1. Keep optional features in their own plugin folder
2. Add a manifest in `plugins/<id>/plugin.json`
3. Add plugin contributions in `plugins/<id>/plugin.tsx`
4. Restart the app so the registry regenerates
5. Let the UI discover and toggle the plugin

`Blockscape` is the first real example plugin module.
