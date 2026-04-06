"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { GENERATED_PLUGINS } from "./generated-plugin-registry"
import {
  PLUGIN_SETTINGS_STORAGE_KEY,
  PLUGIN_STORAGE_KEY,
  type NodepadPluginSettingDefinition,
  type NodepadPluginSettings,
  type NodepadPluginSettingValue,
} from "./plugins"

function loadStoredEnabledPluginIds(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(PLUGIN_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === "string")
  } catch {
    return []
  }
}

function loadStoredPluginSettings(): Record<string, NodepadPluginSettings> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(PLUGIN_SETTINGS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}

    const result: Record<string, NodepadPluginSettings> = {}
    for (const [pluginId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue
      const settings: NodepadPluginSettings = {}
      for (const [settingId, settingValue] of Object.entries(value)) {
        if (
          typeof settingValue === "string" ||
          typeof settingValue === "number" ||
          typeof settingValue === "boolean"
        ) {
          settings[settingId] = settingValue
        }
      }
      result[pluginId] = settings
    }
    return result
  } catch {
    return {}
  }
}

function persistEnabledPluginIds(ids: string[]) {
  localStorage.setItem(PLUGIN_STORAGE_KEY, JSON.stringify(ids))
}

function persistPluginSettings(settings: Record<string, NodepadPluginSettings>) {
  localStorage.setItem(PLUGIN_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

function isValidStoredSettingValue(
  definition: NodepadPluginSettingDefinition,
  value: NodepadPluginSettingValue | undefined,
): boolean {
  switch (definition.type) {
    case "color":
    case "textarea":
      return typeof value === "string"
    default:
      return false
  }
}

export function usePlugins() {
  const [storedEnabledIds, setStoredEnabledIds] = useState<string[]>([])
  const [storedPluginSettings, setStoredPluginSettings] = useState<Record<string, NodepadPluginSettings>>({})

  useEffect(() => {
    setStoredEnabledIds(loadStoredEnabledPluginIds())
    setStoredPluginSettings(loadStoredPluginSettings())
  }, [])

  const plugins = useMemo(
    () => GENERATED_PLUGINS,
    [],
  )

  const availablePluginIds = useMemo(
    () => new Set(plugins.map(plugin => plugin.manifest.id)),
    [plugins],
  )

  const enabledPluginIds = useMemo(() => {
    const ids = new Set<string>()
    for (const plugin of plugins) {
      if (plugin.manifest.enabledByDefault) ids.add(plugin.manifest.id)
    }
    for (const id of storedEnabledIds) {
      if (availablePluginIds.has(id)) ids.add(id)
    }
    return Array.from(ids)
  }, [plugins, storedEnabledIds, availablePluginIds])

  const enabledPluginIdSet = useMemo(
    () => new Set(enabledPluginIds),
    [enabledPluginIds],
  )

  const enabledPlugins = useMemo(
    () => plugins.filter(plugin => enabledPluginIdSet.has(plugin.manifest.id)),
    [plugins, enabledPluginIdSet],
  )

  const pluginSettingsByPluginId = useMemo(() => {
    const result: Record<string, NodepadPluginSettings> = {}

    for (const plugin of plugins) {
      const definitions = plugin.module?.settings ?? []
      const storedSettings = storedPluginSettings[plugin.manifest.id] ?? {}
      const resolvedSettings: NodepadPluginSettings = {}

      for (const definition of definitions) {
        resolvedSettings[definition.id] = definition.defaultValue

        const storedValue = storedSettings[definition.id]
        if (isValidStoredSettingValue(definition, storedValue)) {
          resolvedSettings[definition.id] = storedValue
        }
      }

      result[plugin.manifest.id] = resolvedSettings
    }

    return result
  }, [plugins, storedPluginSettings])

  const setEnabledPluginIds = useCallback((ids: string[]) => {
    const filtered = ids.filter(id => availablePluginIds.has(id))
    persistEnabledPluginIds(filtered)
    setStoredEnabledIds(filtered)
  }, [availablePluginIds])

  const setPluginSetting = useCallback((pluginId: string, settingId: string, value: NodepadPluginSettingValue) => {
    const plugin = plugins.find(entry => entry.manifest.id === pluginId)
    const definition = plugin?.module?.settings?.find(setting => setting.id === settingId)
    if (!definition) return
    if (!isValidStoredSettingValue(definition, value)) return

    setStoredPluginSettings(prev => {
      const next = {
        ...prev,
        [pluginId]: {
          ...(prev[pluginId] ?? {}),
          [settingId]: value,
        },
      }
      persistPluginSettings(next)
      return next
    })
  }, [plugins])

  return {
    plugins,
    enabledPlugins,
    enabledPluginIds,
    pluginSettingsByPluginId,
    setEnabledPluginIds,
    setPluginSetting,
  }
}
