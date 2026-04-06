import { ALL_CONTENT_TYPES, type ContentType } from "@/lib/content-types"
import { detectContentType } from "@/lib/detect-content-type"
import type {
  NodepadPluginBlockInput,
  NodepadPluginSourceInput,
  NodepadPluginSubTaskInput,
} from "@/lib/plugins"

type FrontmatterScalar = string | number | boolean | null
type FrontmatterValue =
  | FrontmatterScalar
  | FrontmatterValue[]
  | { [key: string]: FrontmatterValue }

interface ParsedLine {
  raw: string
  indent: number
  content: string
}

interface FrontmatterParseResult {
  data: Record<string, FrontmatterValue>
  body: string
}

interface ImportedCandidate {
  block: NodepadPluginBlockInput
  aliases: string[]
  influenceRefs: string[]
  fileName: string
}

export interface MarkdownImportResult {
  blocks: NodepadPluginBlockInput[]
  warnings: string[]
}

const CONTENT_TYPES = new Set<ContentType>(ALL_CONTENT_TYPES)

function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n?/g, "\n")
}

function countIndent(raw: string): number {
  const match = raw.match(/^ */)
  return match ? match[0].length : 0
}

function findKeySeparator(content: string): number {
  return content.indexOf(":")
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function splitInlineList(raw: string): string[] {
  const items: string[] = []
  let current = ""
  let quote: "'" | '"' | null = null

  for (const char of raw) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote === char ? null : char
      current += char
      continue
    }
    if (char === "," && !quote) {
      const item = current.trim()
      if (item) items.push(item)
      current = ""
      continue
    }
    current += char
  }

  const finalItem = current.trim()
  if (finalItem) items.push(finalItem)
  return items
}

function parseScalar(raw: string): FrontmatterValue {
  const trimmed = raw.trim()
  const lower = trimmed.toLowerCase()

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim()
    if (!inner) return []
    return splitInlineList(inner).map(item => parseScalar(item))
  }

  if (lower === "true" || lower === "yes" || lower === "on") return true
  if (lower === "false" || lower === "no" || lower === "off") return false
  if (lower === "null" || lower === "~") return null

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric)) return numeric
  }

  return stripQuotes(trimmed)
}

function parseYamlSubset(raw: string): Record<string, FrontmatterValue> {
  const lines: ParsedLine[] = normalizeLineEndings(raw).split("\n").map(line => ({
    raw: line,
    indent: countIndent(line),
    content: line.trimStart(),
  }))

  let index = 0

  function skipTrivia() {
    while (index < lines.length) {
      const line = lines[index]
      if (line.content === "" || line.content.startsWith("#")) {
        index++
        continue
      }
      break
    }
  }

  function parseBlockScalar(expectedIndent: number, fold: boolean): string {
    const values: string[] = []

    while (index < lines.length) {
      const line = lines[index]
      if (line.content === "") {
        values.push("")
        index++
        continue
      }
      if (line.indent < expectedIndent) break
      values.push(line.raw.slice(expectedIndent))
      index++
    }

    if (!fold) return values.join("\n").trim()

    const folded: string[] = []
    for (const line of values) {
      if (line === "") {
        folded.push("\n")
        continue
      }
      if (folded.length === 0 || folded[folded.length - 1] === "\n") {
        folded.push(line.trim())
      } else {
        folded.push(` ${line.trim()}`)
      }
    }
    return folded.join("").trim()
  }

  function parseNested(expectedIndent: number): FrontmatterValue {
    skipTrivia()
    if (index >= lines.length) return ""

    const line = lines[index]
    if (line.indent < expectedIndent) return ""
    if (line.indent === expectedIndent && line.content.startsWith("- ")) {
      return parseArray(expectedIndent)
    }
    if (line.indent >= expectedIndent) {
      return parseMap(line.indent === expectedIndent ? expectedIndent : line.indent)
    }
    return ""
  }

  function parseObjectEntry(expectedIndent: number, content: string): [string, FrontmatterValue] | null {
    const separator = findKeySeparator(content)
    if (separator === -1) return null

    const key = content.slice(0, separator).trim()
    const rest = content.slice(separator + 1).trim()

    if (rest === "|" || rest === ">") {
      return [key, parseBlockScalar(expectedIndent + 2, rest === ">")]
    }
    if (rest === "") {
      return [key, parseNested(expectedIndent + 2)]
    }
    return [key, parseScalar(rest)]
  }

  function parseArrayItemContinuation(expectedIndent: number): Record<string, FrontmatterValue> {
    const object: Record<string, FrontmatterValue> = {}

    while (index < lines.length) {
      skipTrivia()
      if (index >= lines.length) break

      const line = lines[index]
      if (line.indent < expectedIndent) break
      if (line.indent === expectedIndent && line.content.startsWith("- ")) break
      if (line.indent !== expectedIndent) break

      index++
      const entry = parseObjectEntry(expectedIndent, line.content)
      if (entry) object[entry[0]] = entry[1]
    }

    return object
  }

  function parseArray(expectedIndent: number): FrontmatterValue[] {
    const items: FrontmatterValue[] = []

    while (index < lines.length) {
      skipTrivia()
      if (index >= lines.length) break

      const line = lines[index]
      if (line.indent < expectedIndent) break
      if (line.indent !== expectedIndent || !line.content.startsWith("- ")) break

      const afterDash = line.content.slice(2).trim()
      index++

      if (afterDash === "|" || afterDash === ">") {
        items.push(parseBlockScalar(expectedIndent + 2, afterDash === ">"))
        continue
      }

      if (afterDash === "") {
        items.push(parseNested(expectedIndent + 2))
        continue
      }

      const separator = findKeySeparator(afterDash)
      if (separator !== -1) {
        const object: Record<string, FrontmatterValue> = {}
        const entry = parseObjectEntry(expectedIndent + 2, afterDash)
        if (entry) object[entry[0]] = entry[1]
        Object.assign(object, parseArrayItemContinuation(expectedIndent + 2))
        items.push(object)
        continue
      }

      items.push(parseScalar(afterDash))
    }

    return items
  }

  function parseMap(expectedIndent: number): Record<string, FrontmatterValue> {
    const object: Record<string, FrontmatterValue> = {}

    while (index < lines.length) {
      skipTrivia()
      if (index >= lines.length) break

      const line = lines[index]
      if (line.indent < expectedIndent) break
      if (line.indent > expectedIndent) {
        index++
        continue
      }
      if (line.content.startsWith("- ")) break

      index++
      const entry = parseObjectEntry(expectedIndent, line.content)
      if (entry) object[entry[0]] = entry[1]
    }

    return object
  }

  return parseMap(0)
}

function extractFrontmatter(raw: string): FrontmatterParseResult {
  const normalized = normalizeLineEndings(raw)
  if (!normalized.startsWith("---\n")) {
    return { data: {}, body: normalized }
  }

  const lines = normalized.split("\n")
  let closingIndex = -1
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === "---" || line === "...") {
      closingIndex = i
      break
    }
  }

  if (closingIndex === -1) {
    return { data: {}, body: normalized }
  }

  return {
    data: parseYamlSubset(lines.slice(1, closingIndex).join("\n")),
    body: lines.slice(closingIndex + 1).join("\n").replace(/^\n+/, ""),
  }
}

function getStringValue(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined
}

function getBooleanValue(value: FrontmatterValue | undefined): boolean | undefined {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (["true", "yes", "on", "1"].includes(normalized)) return true
    if (["false", "no", "off", "0"].includes(normalized)) return false
  }
  return undefined
}

function getNumberValue(value: FrontmatterValue | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const numeric = Number(value.trim())
    if (Number.isFinite(numeric)) return numeric
  }
  return undefined
}

function getFileStem(name: string): string {
  return name.replace(/\.[^.]+$/, "")
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

function chooseUniqueId(preferredId: string | undefined, fallback: string, usedIds: Set<string>): string {
  const base = preferredId || slugify(fallback) || "md"
  let candidate = base
  let suffix = 2
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`
    suffix++
  }
  usedIds.add(candidate)
  return candidate
}

function parseTimestamp(value: FrontmatterValue | undefined, fallback: number): number {
  const numeric = getNumberValue(value)
  if (numeric !== undefined) {
    if (numeric > 0 && numeric < 1_000_000_000_000) return Math.round(numeric * 1000)
    return Math.round(numeric)
  }

  const stringValue = getStringValue(value)
  if (stringValue) {
    const parsed = Date.parse(stringValue)
    if (!Number.isNaN(parsed)) return parsed
  }

  return fallback
}

function parseConfidence(value: FrontmatterValue | undefined): number | null | undefined {
  const numeric = getNumberValue(value)
  if (numeric === undefined) return undefined

  const scaled = numeric >= 0 && numeric <= 1 ? numeric * 100 : numeric
  return Math.min(100, Math.max(0, Math.round(scaled)))
}

function parseContentType(value: FrontmatterValue | undefined): ContentType | undefined {
  const raw = getStringValue(value)?.toLowerCase() as ContentType | undefined
  return raw && CONTENT_TYPES.has(raw) ? raw : undefined
}

function parseStringList(value: FrontmatterValue | undefined): string[] {
  if (!value) return []
  if (typeof value === "string") {
    return value
      .split(",")
      .map(item => item.trim())
      .filter(Boolean)
  }
  if (Array.isArray(value)) {
    return value
      .flatMap(item => (typeof item === "string" ? [item.trim()] : []))
      .filter(Boolean)
  }
  return []
}

function parseCategory(data: Record<string, FrontmatterValue>): string | undefined {
  const direct = getStringValue(data.category)
  if (direct) return direct

  const firstTag = parseStringList(data.tags)[0]
  return firstTag || undefined
}

function deriveSiteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

function normalizeSource(value: FrontmatterValue): NodepadPluginSourceInput | null {
  if (typeof value === "string") {
    const url = value.trim()
    if (!url) return null
    const siteName = deriveSiteName(url)
    return {
      url,
      title: siteName || url,
      siteName,
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const source = value as Record<string, FrontmatterValue>
  const url = getStringValue(source.url)
  if (!url) return null

  const siteName = getStringValue(source.siteName) || deriveSiteName(url)
  const title = getStringValue(source.title) || siteName || url
  return { url, title, siteName }
}

function parseSources(value: FrontmatterValue | undefined): NodepadPluginSourceInput[] | undefined {
  if (!value) return undefined

  const list = Array.isArray(value) ? value : [value]
  const sources = list
    .map(item => normalizeSource(item))
    .filter((item): item is NodepadPluginSourceInput => item !== null)

  return sources.length > 0 ? sources : undefined
}

function parseSubTasks(value: FrontmatterValue | undefined, fallbackTimestamp: number): NodepadPluginSubTaskInput[] | undefined {
  if (!Array.isArray(value)) return undefined

  const subTasks = value.flatMap((item): NodepadPluginSubTaskInput[] => {
    if (typeof item === "string" && item.trim()) {
      return [{
        text: item.trim(),
        isDone: false,
        timestamp: fallbackTimestamp,
      }]
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const object = item as Record<string, FrontmatterValue>
    const text = getStringValue(object.text) || getStringValue(object.title) || getStringValue(object.task)
    if (!text) return []

    return [{
      id: getStringValue(object.id),
      text,
      isDone: getBooleanValue(object.isDone) ?? getBooleanValue(object.done) ?? false,
      timestamp: parseTimestamp(object.timestamp ?? object.date ?? object.created, fallbackTimestamp),
    }]
  })

  return subTasks.length > 0 ? subTasks : undefined
}

function firstMeaningfulLine(input: string | undefined): string | undefined {
  if (!input) return undefined

  for (const line of input.split("\n")) {
    const cleaned = line
      .replace(/^#+\s*/, "")
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/^\s*\[[ xX]\]\s+/, "")
      .trim()
    if (cleaned) return cleaned
  }
  return undefined
}

function joinParagraphs(parts: Array<string | undefined>): string | undefined {
  const compact = parts.map(part => part?.trim()).filter((part): part is string => Boolean(part))
  return compact.length > 0 ? compact.join("\n\n") : undefined
}

function resolveTitleAndBody(
  data: Record<string, FrontmatterValue>,
  body: string,
  fallbackTitle: string,
): {
  text: string
  annotation?: string
  detectionText: string
} {
  const frontmatterTitle = getStringValue(data.title) || getStringValue(data.text)
  let remainingBody = body.trim()
  let headingTitle: string | undefined

  if (!frontmatterTitle) {
    const headingMatch = remainingBody.match(/^#\s+(.+?)\s*(?:\n+|$)/)
    if (headingMatch) {
      headingTitle = headingMatch[1].trim()
      remainingBody = remainingBody.slice(headingMatch[0].length).replace(/^\n+/, "")
    }
  }

  const text = frontmatterTitle || headingTitle || fallbackTitle
  const annotation = joinParagraphs([
    getStringValue(data.annotation),
    remainingBody,
  ])

  const detectionText = frontmatterTitle || headingTitle
    ? text
    : firstMeaningfulLine(annotation) || text

  return { text, annotation, detectionText }
}

function normalizeAlias(value: string): string {
  return value.trim().replace(/\\/g, "/").toLowerCase()
}

function collectAliases(file: File, text: string, id: string, explicitId?: string): string[] {
  const aliases = new Set<string>()
  const stem = getFileStem(file.name)

  for (const value of [explicitId, id, file.name, stem, file.webkitRelativePath, text, slugify(text)]) {
    if (!value) continue
    const normalized = normalizeAlias(value)
    if (normalized) aliases.add(normalized)
  }

  return Array.from(aliases)
}

function resolveInfluenceRefs(
  refs: string[],
  aliasToId: Map<string, string>,
  ambiguousAliases: Set<string>,
  warnings: string[],
  fileName: string,
): string[] | undefined {
  const resolved = new Set<string>()

  for (const ref of refs) {
    const alias = normalizeAlias(ref)
    if (!alias) continue

    if (ambiguousAliases.has(alias)) {
      warnings.push(`Skipped ambiguous influencedBy reference "${ref}" in ${fileName}.`)
      continue
    }

    const targetId = aliasToId.get(alias)
    if (!targetId) {
      warnings.push(`Could not resolve influencedBy reference "${ref}" in ${fileName}.`)
      continue
    }

    resolved.add(targetId)
  }

  return resolved.size > 0 ? Array.from(resolved) : undefined
}

export async function importMarkdownFiles(
  files: File[],
  existingBlockIds: string[],
): Promise<MarkdownImportResult> {
  const warnings: string[] = []
  const usedIds = new Set(existingBlockIds)
  const candidates: ImportedCandidate[] = []
  const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name))

  for (const file of sortedFiles) {
    const raw = await file.text()
    const { data, body } = extractFrontmatter(raw)
    const explicitId = getStringValue(data.id)
    const stem = getFileStem(file.name)
    const { text, annotation, detectionText } = resolveTitleAndBody(data, body, stem)
    const id = chooseUniqueId(explicitId, stem, usedIds)
    const timestamp = parseTimestamp(data.timestamp ?? data.date ?? data.created, file.lastModified)
    const contentType = parseContentType(data.contentType ?? data.type) || detectContentType(detectionText)
    const subTasks = parseSubTasks(data.subTasks ?? data.tasks, timestamp)
    const category = parseCategory(data)
    const confidence = parseConfidence(data.confidence)
    const sources = parseSources(data.sources)

    const block: NodepadPluginBlockInput = {
      id,
      text,
      timestamp,
      contentType,
      ...(category ? { category } : {}),
      ...(annotation ? { annotation } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      ...(sources ? { sources } : {}),
      ...(getBooleanValue(data.isPinned ?? data.pinned) === true ? { isPinned: true } : {}),
      ...(getBooleanValue(data.isUnrelated ?? data.unrelated) === true ? { isUnrelated: true } : {}),
      ...(subTasks ? { subTasks } : {}),
    }

    candidates.push({
      block,
      aliases: collectAliases(file, text, id, explicitId),
      influenceRefs: parseStringList(data.influencedBy),
      fileName: file.name,
    })
  }

  const aliasToId = new Map<string, string>()
  const ambiguousAliases = new Set<string>()

  for (const candidate of candidates) {
    for (const alias of candidate.aliases) {
      const existing = aliasToId.get(alias)
      if (!existing) {
        aliasToId.set(alias, candidate.block.id || "")
        continue
      }
      if (existing !== candidate.block.id) {
        ambiguousAliases.add(alias)
      }
    }
  }

  const blocks = candidates.map(candidate => {
    const influencedBy = resolveInfluenceRefs(
      candidate.influenceRefs,
      aliasToId,
      ambiguousAliases,
      warnings,
      candidate.fileName,
    )

    return influencedBy
      ? { ...candidate.block, influencedBy }
      : candidate.block
  })

  return { blocks, warnings }
}
