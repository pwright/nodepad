"use client"

import { Download, GitFork } from "lucide-react"
import type { NodepadPluginModule } from "@/lib/plugins"
import {
  BLOCKSCAPE_CATEGORY_MAPPINGS_SETTING_ID,
  DEFAULT_BLOCKSCAPE_CATEGORY_MAPPINGS,
} from "./display-settings"
import { Graph2Area } from "./graph2-area"
import { exportToBlockscape } from "./export"

function slugifyProjectName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
}

export const plugin: NodepadPluginModule = {
  settings: [
    {
      id: BLOCKSCAPE_CATEGORY_MAPPINGS_SETTING_ID,
      label: "Category mappings",
      description:
        "One category per line in the form `Category: type, type`. Unmapped note types stay hidden in the Blockscape view.",
      type: "textarea",
      defaultValue: DEFAULT_BLOCKSCAPE_CATEGORY_MAPPINGS,
      rows: 7,
      placeholder: DEFAULT_BLOCKSCAPE_CATEGORY_MAPPINGS,
    },
    {
      id: "backgroundColor",
      label: "Background color",
      description: "Canvas background for the Blockscape view.",
      type: "color",
      defaultValue: "#0f1729",
    },
  ],
  views: [
    {
      id: "graph2",
      label: "Blockscape",
      icon: GitFork,
      component: Graph2Area,
      about: {
        description:
          "A structured dependency map. Nodes are sorted into plugin-defined lanes by note type. By default, Blockscape groups notes into Outcome, Inputs, Resolvers, Stable, and Reference lanes, while dependencies pull related cards into vertical clusters.",
      },
    },
  ],
  actions: [
    {
      id: "export-blockscape",
      label: "Export",
      sub: "blockscape",
      icon: Download,
      about: {
        title: "Export Blockscape JSON",
        description:
          "Export the active project as Blockscape JSON with ordered categories, truncated item names, and dependency ids for Blockscape-compatible tooling.",
      },
      run({ activeProject, downloadJson }) {
        if (!activeProject) return
        const data = exportToBlockscape(activeProject)
        const slug = slugifyProjectName(activeProject.name)
        downloadJson(`${slug || "project"}-blockscape.json`, data)
      },
    },
  ],
}
