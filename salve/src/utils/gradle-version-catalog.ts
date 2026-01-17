import { parse } from 'smol-toml'

type LibraryEntry =
  | string
  | { module: string; version: string | { ref: string } }
type PluginEntry = { id: string; version: string | { ref: string } }

type VersionCatalog = {
  versions: Record<string, string>
  libraries: Record<string, LibraryEntry>
  plugins: Record<string, PluginEntry>
}

export function replaceVersionRef(
  content: string,
  ref: string,
  newVersion: string
): string {
  // Match version ref format: ref = "version"
  const pattern = new RegExp(`(^${ref}\\s*=\\s*")([^"]*)(")`, 'm')
  return content.replace(pattern, `$1${newVersion}$3`)
}

export function replaceInlineVersion(
  content: string,
  entryName: string,
  newVersion: string
): string {
  // Match inline table format: entryName = { ... version = "oldVersion" ... }
  const inlinePattern = new RegExp(
    `(^${entryName}\\s*=\\s*\\{[^}]*\\bversion\\s*=\\s*")([^"]*)("[^}]*\\})`,
    'm'
  )
  return content.replace(inlinePattern, `$1${newVersion}$3`)
}

export function replaceShortNotation(
  content: string,
  entryName: string,
  newVersion: string
): string {
  // Match short notation: entryName = "group:artifact:version"
  const shortPattern = new RegExp(
    `(^${entryName}\\s*=\\s*"[^:]+:[^:]+:)([^"]*)(")`,
    'm'
  )
  return content.replace(shortPattern, `$1${newVersion}$3`)
}

export function parseShortNotation(
  value: string
): { module: string; version: string } | null {
  const parts = value.split(':')
  if (parts.length === 3) {
    return {
      module: `${parts[0]}:${parts[1]}`,
      version: parts[2]
    }
  }
  return null
}

export async function updateCatalogVersion(options: {
  ref?: string
  library?: string
  plugin?: string
  version?: string
  content: string
}): Promise<{ oldVersion: string; version?: string; content: string }> {
  const {
    ref,
    library,
    plugin,
    version,
    content
  } = options

  if (version && typeof version !== 'string') {
    throw new Error('version is not a string')
  }

  let catalogContent = content

  const catalog = parse(catalogContent) as VersionCatalog

  let oldVersion: string | undefined
  let refToUpdate: string | undefined

  if (ref) {
    if (!catalog.versions?.[ref]) {
      throw new Error(`ref '${ref}' not found in [versions] section`)
    }
    oldVersion = catalog.versions[ref]
    refToUpdate = ref
  } else if (library) {
    let entry = catalog.libraries?.[library]
    let entryKey = library
    if (!entry) {
      const key = Object.keys(catalog.libraries ?? {}).find((k) => {
        const e = catalog.libraries![k]
        if (typeof e === 'string') {
          const parsed = parseShortNotation(e)
          return (
            parsed &&
            (parsed.module === library ||
              parsed.module.startsWith(library + ':'))
          )
        }
        return e.module === library || e.module.startsWith(library + ':')
      })
      if (key) {
        entry = catalog.libraries![key]
        entryKey = key
      }
    }
    if (!entry) {
      throw new Error(`library '${library}' not found in [libraries] section`)
    }
    // Handle short notation: "group:artifact:version"
    if (typeof entry === 'string') {
      const parsed = parseShortNotation(entry)
      if (!parsed) {
        throw new Error('Invalid short notation format')
      }
      oldVersion = parsed.version
      if (version) {
        catalogContent = replaceShortNotation(catalogContent, entryKey, version)
      }
    } else if (typeof entry.version === 'string') {
      oldVersion = entry.version
      if (version) {
        catalogContent = replaceInlineVersion(catalogContent, entryKey, version)
      }
    } else if (typeof entry.version === 'object') {
      refToUpdate = entry.version.ref
      oldVersion = catalog.versions[refToUpdate]
    } else {
      throw new Error('Invalid version structure')
    }
  } else if (plugin) {
    let entry = catalog.plugins?.[plugin]
    let entryKey = plugin
    if (!entry) {
      const key = Object.keys(catalog.plugins ?? {}).find(
        (k) => catalog.plugins![k].id === plugin
      )
      if (key) {
        entry = catalog.plugins![key]
        entryKey = key
      }
    }
    if (!entry) {
      throw new Error(`plugin '${plugin}' not found in [plugins] section`)
    }
    if (typeof entry.version === 'string') {
      oldVersion = entry.version
      if (version) {
        catalogContent = replaceInlineVersion(catalogContent, entryKey, version)
      }
    } else if (typeof entry.version === 'object') {
      refToUpdate = entry.version.ref
      oldVersion = catalog.versions[refToUpdate]
    } else {
      throw new Error('Invalid version structure')
    }
  } else {
    throw new Error('One of ref, library, or plugin must be provided')
  }

  if (version && refToUpdate) {
    catalogContent = replaceVersionRef(catalogContent, refToUpdate, version)
  }

  return { oldVersion: oldVersion!, version, content: catalogContent }
}
