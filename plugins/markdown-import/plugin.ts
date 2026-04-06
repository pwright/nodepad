"use client"

import { FolderInput } from "lucide-react"
import type { NodepadPluginModule } from "@/lib/plugins"
import { importMarkdownFiles } from "./import"

function openMarkdownPicker(onFiles: (files: File[]) => void) {
  const input = document.createElement("input")
  input.type = "file"
  input.accept = ".md,.markdown,text/markdown"
  input.multiple = true
  input.className = "hidden"

  input.addEventListener("change", () => {
    const files = Array.from(input.files ?? [])
    input.remove()
    if (files.length === 0) return
    onFiles(files)
  }, { once: true })

  document.body.appendChild(input)
  input.click()
}

export const plugin: NodepadPluginModule = {
  actions: [
    {
      id: "import-markdown",
      label: "Import",
      sub: "markdown",
      icon: FolderInput,
      about: {
        title: "Import Markdown Files",
        description:
          "Append multiple Markdown files into the current project. Frontmatter fields map onto core nodepad block fields, and Markdown bodies are preserved in note annotations.",
      },
      run({ activeProject, appendBlocks }) {
        if (!activeProject) return

        openMarkdownPicker(async files => {
          try {
            const { blocks, warnings } = await importMarkdownFiles(
              files,
              activeProject.blocks.map(block => block.id),
            )

            if (blocks.length === 0) {
              alert("No importable Markdown files were selected.")
              return
            }

            appendBlocks(blocks)

            if (warnings.length > 0) {
              alert([
                `Imported ${blocks.length} Markdown file${blocks.length === 1 ? "" : "s"}.`,
                "",
                warnings.slice(0, 8).join("\n"),
                warnings.length > 8 ? `\n...and ${warnings.length - 8} more warning${warnings.length - 8 === 1 ? "" : "s"}.` : "",
              ].join("\n"))
            }
          } catch (error) {
            console.error("Markdown import failed", error)
            alert("Could not import Markdown files.")
          }
        })
      },
    },
  ],
}
