# Markdown Import Plugin

`Markdown Import` appends Markdown files into the current nodepad project.

It is designed for small batch imports where you already have a folder of notes and want to pull them into the canvas without converting them to `.nodepad` first.

## What it does

- imports multiple `.md` or `.markdown` files at once
- adds each file as one new node in the current project
- preserves Markdown body content in the node `annotation`
- maps supported YAML frontmatter fields onto core nodepad block fields
- resolves `influencedBy` links between imported files when possible
- optionally uses AI to update node metadata while keeping the imported Markdown body

## What it does not do

- it does not create a new project
- it does not replace the current project
- it does not support every YAML feature

This plugin appends notes into the active project only.

## Using the plugin

1. Enable `Markdown Import` in `Settings -> Plugins`.
2. Open the command palette with `Cmd/Ctrl+K`.
3. Run one of:
   - `Import -> markdown`
   - `Import -> markdown + AI`
4. Select one or more Markdown files.

After import:

- each file becomes one node
- the file body is kept as Markdown in the note annotation
- if there are mapping warnings, nodepad shows them after import

`Import -> markdown + AI` updates imported node metadata:

- `contentType`
- `category`
- `confidence`
- `sources`
- `influencedBy`
- `isUnrelated`

The AI import path keeps the original Markdown body in `annotation`. It does not replace that body with an AI-written note.

## Practical scope

This plugin is intended for modest imports. A few files to a few dozen files is the sweet spot.

If you are importing a very large archive, a separate offline conversion pass may still be the better workflow.

## How files map into nodes

Each Markdown file becomes one block.

Title selection order:

1. frontmatter `title` or `text`
2. first Markdown `# Heading`
3. filename stem

Body mapping:

- the remaining Markdown body is stored in `annotation`
- if frontmatter already includes `annotation`, that value is prepended before the body

Type selection:

- frontmatter `contentType` or `type` is used when valid
- otherwise the plugin falls back to nodepad's normal text heuristics
- with `Import -> markdown + AI`, AI can refine the metadata after import while preserving the body

## Supported frontmatter keys

These keys are recognized:

- `id`
- `title`
- `text`
- `annotation`
- `contentType`
- `type`
- `category`
- `tags`
- `timestamp`
- `date`
- `created`
- `confidence`
- `sources`
- `influencedBy`
- `isPinned`
- `pinned`
- `isUnrelated`
- `unrelated`
- `subTasks`
- `tasks`

Unrecognized keys are ignored.

## Example frontmatter

```yaml
---
id: ollama-json
title: Getting JSON from Ollama
contentType: reference
category: AI Integration
date: 2026-04-01
confidence: 92
isPinned: true
sources:
  - url: https://example.com/ollama-json
    title: Ollama JSON mode
    siteName: example.com
influencedBy:
  - ai-pipelines
subTasks:
  - text: Compare Ollama JSON mode with tool calling
    isDone: false
---
```

## Frontmatter notes

`tags`:

- if `category` is missing, the first tag is used as the node category

`confidence`:

- values from `0` to `100` are accepted directly
- values from `0` to `1` are scaled to percentages

`sources`:

- can be a list of URLs
- or a list of objects with `url`, `title`, and `siteName`

`subTasks` or `tasks`:

- can be a list of strings
- or a list of objects with fields such as `text`, `isDone`, and `timestamp`

## `influencedBy` resolution

The plugin tries to resolve links between imported notes using values such as:

- explicit frontmatter `id`
- generated/imported node id
- filename
- filename stem
- note title

If a reference is ambiguous or cannot be resolved, the import still succeeds and that dependency is skipped.

## Current limitations

- one file always maps to one node
- frontmatter parsing supports a practical YAML subset, not full YAML
- folder selection is not built in; select multiple files from the picker instead
- `Import -> markdown + AI` needs a configured OpenRouter API key to apply AI metadata; otherwise the files still import normally
- the AI import path updates metadata, but intentionally preserves the imported Markdown body instead of replacing it
