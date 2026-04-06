import type { ComponentType } from "react"
import type { LucideIcon } from "lucide-react"
import type { ContentType } from "@/lib/content-types"
import type { TextBlock } from "@/components/tile-card"

export const PLUGIN_STORAGE_KEY = "nodepad-enabled-plugins"
export const PLUGIN_SETTINGS_STORAGE_KEY = "nodepad-plugin-settings"

export interface NodepadPluginManifest {
  id: string
  label: string
  description: string
  enabledByDefault?: boolean
}

export interface NodepadPluginGhostNote {
  id: string
  text: string
  category: string
  isGenerating: boolean
}

export interface NodepadPluginProject {
  id: string
  name: string
  blocks: TextBlock[]
}

export type NodepadPluginSettingValue = string | number | boolean
export type NodepadPluginSettings = Record<string, NodepadPluginSettingValue>

export interface NodepadPluginColorSettingDefinition {
  id: string
  label: string
  description?: string
  type: "color"
  defaultValue: string
}

export interface NodepadPluginTextareaSettingDefinition {
  id: string
  label: string
  description?: string
  type: "textarea"
  defaultValue: string
  rows?: number
  placeholder?: string
}

export type NodepadPluginSettingDefinition =
  | NodepadPluginColorSettingDefinition
  | NodepadPluginTextareaSettingDefinition

export interface NodepadPluginViewProps {
  blocks: TextBlock[]
  ghostNote?: NodepadPluginGhostNote
  projectName: string
  pluginSettings: NodepadPluginSettings
  onReEnrich: (id: string) => void
  onChangeType: (id: string, newType: ContentType) => void
  onTogglePin: (id: string) => void
  onEdit: (id: string, text: string) => void
  onEditAnnotation: (id: string, annotation: string) => void
  highlightedBlockId?: string | null
  onHighlight?: (id: string | null) => void
}

export interface NodepadPluginViewContribution {
  id: string
  label: string
  icon: LucideIcon
  component: ComponentType<NodepadPluginViewProps>
  about?: {
    description: string
  }
}

export interface NodepadPluginActionContext {
  activeProject: NodepadPluginProject | null
  pluginSettings: NodepadPluginSettings
  downloadJson: (filename: string, data: unknown) => void
  setViewMode: (viewId: string) => void
}

export interface NodepadPluginActionContribution {
  id: string
  label: string
  sub?: string
  icon: LucideIcon
  run: (context: NodepadPluginActionContext) => void
  about?: {
    title?: string
    description: string
  }
}

export interface NodepadPluginModule {
  views?: NodepadPluginViewContribution[]
  actions?: NodepadPluginActionContribution[]
  settings?: NodepadPluginSettingDefinition[]
}

export interface RegisteredNodepadPlugin {
  manifest: NodepadPluginManifest
  module?: NodepadPluginModule
}

export function normalizePluginManifest(raw: unknown): NodepadPluginManifest | null {
  if (!raw || typeof raw !== "object") return null

  const candidate = raw as Record<string, unknown>
  if (typeof candidate.id !== "string" || candidate.id.trim() === "") return null
  if (typeof candidate.label !== "string" || candidate.label.trim() === "") return null
  if (typeof candidate.description !== "string") return null

  return {
    id: candidate.id,
    label: candidate.label,
    description: candidate.description,
    enabledByDefault: candidate.enabledByDefault === true,
  }
}
