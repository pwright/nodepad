# Blockscape Plugin

`Blockscape` adds a structured dependency map view and a `blockscape` JSON export to nodepad.

It is best read less like a generic graph and more like a Wardley-style map:

- categories are listed from first to last, top to bottom
- a higher category represents more visible user value than a lower category
- nodes are read from left to right within a category
- earlier nodes are less mature; later nodes are more mature

In other words, the vertical axis is value visibility and the horizontal axis is maturity.

## Default category mapping

By default, Blockscape groups note types like this:

```text
Outcome: narrative, comparison
Inputs: idea, opinion, claim
Resolvers: question, task
Stable: definition, entity
Reference: quote, reference
```

The category order matters:

- the first category is rendered at the top
- the last category is rendered at the bottom

The type order inside each category matters too:

- the first type is the primary left-most ordering signal
- later types are pushed later in the lane
- within the same type, Blockscape falls back to its normal sort and dependency layout

## Configuring categories

Blockscape categories are user-defined in plugin settings.

Open `Settings -> Plugins -> Blockscape` and edit `Category mappings` using one line per category:

```text
Category: type, type, type
```

A few practical guidelines:

- put the most user-visible category first
- put the most infrastructural or reference-heavy category later
- order the types inside each category from less mature to more mature

## Using the plugin

1. Enable `Blockscape` in `Settings -> Plugins`.
2. Open the command palette with `Cmd/Ctrl+K`.
3. Switch to the `Blockscape` view.
4. Adjust `Category mappings` if you want a different top-to-bottom or left-to-right reading.

## Exporting Blockscape JSON

Blockscape adds `Export -> blockscape` to the command palette.

After exporting the JSON, you can load it into Blockscape or copy/paste it directly into:

https://pwright.github.io/blockscape
