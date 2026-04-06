# Import Markdown to `.nodepad`

## User story

As a nodepad user, I want a Python script that converts a directory of Markdown files into a single `.nodepad` JSON file so I can import an existing notes folder into nodepad without recreating each note by hand.

## Goal

Build a CLI script that reads a directory of `.md` files and emits a valid core `.nodepad` export matching the versioned schema used by the app in `lib/nodepad-format.ts`.

This script should target the core `.nodepad` format only. It should not emit plugin-specific JSON such as the Blockscape export format.

## Why this shape fits the app

- The core import path expects a `NodepadFile` with `version`, `exportedAt`, and `project`.
- `project.blocks[]` is the primary data we can populate from Markdown.
- `block.text` is rendered as plain text in the UI.
- `block.annotation` is rendered as Markdown in the UI.

Because of that, each Markdown file should normally become one block where:

- `text` is the note title or short label
- `annotation` preserves the Markdown body

That gives the importer a better fidelity path than stuffing a full Markdown document into `text`.

## Proposed CLI

```bash
python scripts/import_md.py <input_dir> -o <output_file.nodepad>
```

Optional flags for the implementation step:

- `--project-name <name>`: override the project name
- `--recursive`: recurse into subdirectories, on by default
- `--verbose`: print mapping and warning details

## Target output schema

The script should emit:

```json
{
  "version": 1,
  "exportedAt": 0,
  "project": {
    "id": "p-example",
    "name": "Example Project",
    "collapsedIds": [],
    "ghostNotes": [],
    "blocks": []
  }
}
```

Populate optional fields only when there is real source data for them.

## Markdown to nodepad mapping

Each Markdown file becomes one `project.blocks[]` entry.

### Project-level mapping

| Source | Target | Notes |
|---|---|---|
| CLI `--project-name` | `project.name` | First priority |
| input directory basename | `project.name` | Fallback |
| generated slug | `project.id` | Stable, project-safe ID |
| current time | `exportedAt` | Unix epoch in ms |
| none | `collapsedIds` | Always `[]` |
| none | `ghostNotes` | Always `[]` |
| none | `lastGhost*` | Omit |

### Block-level mapping

| Markdown/frontmatter source | Nodepad field | Mapping rule |
|---|---|---|
| `id` | `id` | Use if unique, otherwise generate and warn |
| `title` or `text` | `text` | First priority |
| first H1 heading | `text` | Fallback when frontmatter is absent |
| filename stem | `text` | Final fallback |
| Markdown body | `annotation` | Preserve as Markdown |
| `annotation` | `annotation` | Prefer explicit frontmatter annotation, append body if both exist |
| `contentType` or `type` | `contentType` | Accept only valid nodepad values |
| heuristic fallback | `contentType` | Mirror `lib/detect-content-type.ts` where reasonable |
| `category` | `category` | Direct string mapping |
| `tags` | `category` | Use first tag only if `category` is absent |
| `date`, `created`, `timestamp` | `timestamp` | Parse to epoch ms |
| file mtime | `timestamp` | Fallback |
| `confidence` | `confidence` | Normalize to integer `0-100` |
| `sources` | `sources` | Accept nodepad-compatible objects or URLs |
| `influencedBy` | `influencedBy` | Resolve in a second pass |
| `pinned` or `isPinned` | `isPinned` | Boolean |
| `unrelated` or `isUnrelated` | `isUnrelated` | Boolean |
| `subTasks` or `tasks` | `subTasks` | Convert to `{ id, text, isDone, timestamp }[]` |

### Supported `contentType` values

The importer should recognize only the current core types:

- `entity`
- `claim`
- `question`
- `task`
- `idea`
- `reference`
- `quote`
- `definition`
- `opinion`
- `reflection`
- `narrative`
- `comparison`
- `thesis`
- `general`

Invalid values should warn and fall back to heuristic detection, then `general`.

## Frontmatter behavior

If a Markdown file has YAML frontmatter, the importer should use matching nodepad fields where they exist and ignore unrelated keys with a warning in verbose mode.

Example:

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
---
```

This should map cleanly onto the existing `NodepadBlock` structure.

## Parsing rules

1. Discover Markdown files in deterministic sorted order.
2. Parse optional YAML frontmatter.
3. Split title from body:
   - use frontmatter `title` or `text` when present
   - otherwise use the first H1 heading
   - otherwise use the filename stem
4. Preserve the remaining Markdown body in `annotation`.
5. Set `contentType` from frontmatter when valid.
6. If `contentType` is missing, use importer heuristics based on the existing TypeScript classifier.
7. Resolve `influencedBy` after all blocks exist so frontmatter can point to other imported notes by ID, filename stem, or relative path.

## Assumptions for step one

- One Markdown file maps to one block.
- The importer creates one project per directory run.
- Imported Markdown should preserve formatting in `annotation`, not `text`.
- Ghost notes are not synthesized during import.
- Collapsed state is not imported.
- Unknown frontmatter is not preserved anywhere unless it matches an existing nodepad structure.

## Acceptance criteria

- Running the script on a directory of Markdown files produces a valid `.nodepad` JSON file.
- The generated file matches the core schema used by `parseNodepadFile` in `lib/nodepad-format.ts`.
- Each Markdown file becomes one block in `project.blocks`.
- A file with no frontmatter still imports with sensible defaults.
- A file with YAML frontmatter maps matching keys into nodepad fields.
- Markdown body content is preserved in `annotation`.
- `contentType` falls back safely when frontmatter is missing or invalid.
- `timestamp` is always populated.
- `collapsedIds` is empty and `ghostNotes` is empty.
- Plugin export formats are out of scope.
- Unresolvable `influencedBy` references do not fail the run; they warn and are omitted.

## Non-goals

- Importing nodepad's own rich Markdown export back into block-perfect original notes
- Reconstructing AI ghost-note history
- Emitting Blockscape JSON
- Preserving arbitrary frontmatter that has no matching nodepad field
- Running AI enrichment during import

## Implementation notes for the next step

- Place the script under `scripts/import_md.py`.
- Prefer a small, dependency-light implementation.
- If a YAML parser dependency is needed, keep it explicit and optional in the story discussion for the implementation step.
- Add at least one fixture directory and one expected `.nodepad` output for verification.
