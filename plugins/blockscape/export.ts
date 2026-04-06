import type { ContentType } from "@/lib/content-types"

export interface BlockscapeExportProject {
  id: string
  name: string
  blocks: {
    id: string
    text: string
    contentType: ContentType
    influencedBy?: string[]
  }[]
}

export interface BlockscapeExportItem {
  id: string
  name: string
  deps?: string[]
}

export interface BlockscapeExportCategory {
  id: "entity" | "idea" | "question" | "comparison" | "opinion" | "reference"
  title: string
  items: BlockscapeExportItem[]
}

export interface BlockscapeExport {
  id: string
  title: string
  categories: BlockscapeExportCategory[]
  abstract: string
}

const BLOCKSCAPE_CATEGORY_MAP = {
  entity: { id: "entity", title: "Entities" },
  idea: { id: "idea", title: "Ideas" },
  question: { id: "question", title: "Questions" },
  comparison: { id: "comparison", title: "Comparisons" },
  opinion: { id: "opinion", title: "Opinions" },
  reference: { id: "reference", title: "References" },
} as const

const BLOCKSCAPE_CATEGORY_ORDER = [
  "entity",
  "idea",
  "question",
  "comparison",
  "opinion",
  "reference",
] as const

function truncate(text: string, length = 80): string {
  return text.slice(0, length)
}

function isBlockscapeType(
  type: ContentType,
): type is keyof typeof BLOCKSCAPE_CATEGORY_MAP {
  return type in BLOCKSCAPE_CATEGORY_MAP
}

export function exportToBlockscape(project: BlockscapeExportProject): BlockscapeExport {
  const categories = {
    entity: [] as BlockscapeExportItem[],
    idea: [] as BlockscapeExportItem[],
    question: [] as BlockscapeExportItem[],
    comparison: [] as BlockscapeExportItem[],
    opinion: [] as BlockscapeExportItem[],
    reference: [] as BlockscapeExportItem[],
  }

  const visibleTypes = new Set<ContentType>(BLOCKSCAPE_CATEGORY_ORDER)
  const visibleIds = new Set(
    project.blocks
      .filter(block => visibleTypes.has(block.contentType))
      .map(block => block.id),
  )

  for (const block of project.blocks) {
    if (!isBlockscapeType(block.contentType)) continue

    const item: BlockscapeExportItem = {
      id: block.id,
      name: truncate(block.text || ""),
    }

    const deps = (block.influencedBy || []).filter(depId => visibleIds.has(depId))
    if (deps.length > 0) item.deps = deps

    categories[block.contentType].push(item)
  }

  const resultCategories: BlockscapeExportCategory[] = []
  for (const key of BLOCKSCAPE_CATEGORY_ORDER) {
    const items = categories[key]
    if (items.length === 0) continue
    const meta = BLOCKSCAPE_CATEGORY_MAP[key]
    resultCategories.push({
      id: meta.id,
      title: meta.title,
      items,
    })
  }

  return {
    id: project.id,
    title: project.name,
    categories: resultCategories,
    abstract: "",
  }
}
