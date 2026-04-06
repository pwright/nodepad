import { ALL_CONTENT_TYPES, type ContentType } from "@/lib/content-types"

export const BLOCKSCAPE_CATEGORY_MAPPINGS_SETTING_ID = "categoryMappings"

export const DEFAULT_BLOCKSCAPE_CATEGORY_MAPPINGS = [
  "Outcome: narrative, comparison",
  "Inputs: idea, opinion, claim",
  "Resolvers: question, task",
  "Stable: definition, entity",
  "Reference: quote, reference",
].join("\n")

export interface BlockscapeDisplayCategory {
  id: string
  title: string
  types: ContentType[]
}

export interface BlockscapeDisplayConfig {
  categories: BlockscapeDisplayCategory[]
  typeToCategoryId: Map<ContentType, string>
}

const CONTENT_TYPES = new Set<ContentType>(ALL_CONTENT_TYPES)

function slugifyCategoryId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function toContentType(value: string): ContentType | null {
  const normalized = value.trim().toLowerCase()
  if (!CONTENT_TYPES.has(normalized as ContentType)) return null
  return normalized as ContentType
}

function getUniqueCategoryId(title: string, existingIds: Set<string>, index: number): string {
  const baseId = slugifyCategoryId(title) || `category-${index + 1}`
  let candidate = baseId
  let suffix = 2

  while (existingIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`
    suffix += 1
  }

  return candidate
}

export function resolveBlockscapeDisplayConfig(rawValue: unknown): BlockscapeDisplayConfig {
  const rawText = typeof rawValue === "string"
    ? rawValue
    : DEFAULT_BLOCKSCAPE_CATEGORY_MAPPINGS
  const categories: BlockscapeDisplayCategory[] = []
  const categoryIds = new Set<string>()
  const categoryByKey = new Map<string, BlockscapeDisplayCategory>()
  const typeToCategoryId = new Map<ContentType, string>()

  rawText.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return

    const separatorIndex = trimmed.indexOf(":")
    if (separatorIndex <= 0) return

    const title = trimmed.slice(0, separatorIndex).trim()
    if (!title) return

    const seenTypes = new Set<ContentType>()
    const mappedTypes = trimmed
      .slice(separatorIndex + 1)
      .split(",")
      .map(toContentType)
      .filter((type): type is ContentType => type != null)
      .filter(type => {
        if (seenTypes.has(type)) return false
        seenTypes.add(type)
        return true
      })
      .filter(type => !typeToCategoryId.has(type))

    if (mappedTypes.length === 0) return

    const categoryKey = title.toLowerCase()
    let category = categoryByKey.get(categoryKey)
    if (!category) {
      category = {
        id: getUniqueCategoryId(title, categoryIds, index),
        title,
        types: [],
      }
      categories.push(category)
      categoryByKey.set(categoryKey, category)
      categoryIds.add(category.id)
    }

    mappedTypes.forEach(type => {
      category.types.push(type)
      typeToCategoryId.set(type, category!.id)
    })
  })

  return {
    categories,
    typeToCategoryId,
  }
}
