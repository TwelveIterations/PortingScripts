import { compareVersions as baseCompareVersions, validate } from "compare-versions";

/**
 * Compare two version strings and determine their ordering.
 * Falls back to lexicographic comparison if either version is not valid semver.
 *
 * @param a - The first version string to compare
 * @param b - The second version string to compare
 * @returns A negative number if `a` is less than `b`, `0` if they are equal, or a positive number if `a` is greater than `b`
 */
export function compareVersions(a: string, b: string) {
  if (validate(a) && validate(b)) {
    return baseCompareVersions(a, b);
  }
  return a.localeCompare(b);
}

export type ParsedVersion = {
  version: string;
  major?: number;
  minor?: number;
  patch?: number;
  revision?: number;
  stage?: string;
  build?: string;
};

/**
 * Parse a semantic-like version string into its components.
 *
 * @param version - Version string in the form `major.minor.patch[.revision][-stage][+build]`
 * @returns A `ParsedVersion` containing `version`, `major`, `minor`, `patch`, and optionally `revision`, `stage`, and `build`; `null` if the input does not match the expected format
 */
export function parseVersion(version: string) {
  const regex = /^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:-([a-zA-Z][a-zA-Z0-9]*))?(?:\.([^+]+))?(?:\+(.+))?$/;
  const match = version.match(regex);

  if (!match) {
    return null;
  }

  return {
    version,
    major: parseInt(match[1]!, 10),
    minor: parseInt(match[2]!, 10),
    patch: parseInt(match[3]!, 10),
    revision: match[4] ? parseInt(match[4], 10) : undefined,
    stage: match[5],
    build: match[7],
  } satisfies ParsedVersion;
}

/**
 * Compute the embedded Minecraft version string for a parsed version or version string.
 *
 * @param version - A ParsedVersion object or a version string. If a string is provided, the function will attempt to parse numeric components; if parsing fails the input is treated as lacking numeric components.
 * @returns The embedded Minecraft version as `"1.{major}.{minor}"` for majors <= 21, or `"{major}.{minor}.{patch}"` for majors >= 26; `undefined` if numeric components are missing or the major version is 22–25 (unsupported).
 */
export type VersionRange = {
  min?: string;
  max?: string;
  minInclusive: boolean;
  maxInclusive: boolean;
};

/**
 * Parse a Maven-style version range string.
 * Supports formats like:
 * - "[1.20,1.21)" - 1.20 <= v < 1.21
 * - "[1.20,]" or "[1.20,)" - v >= 1.20
 * - "(,1.21]" or "[,1.21]" - v <= 1.21
 * - "1.20" - exact match (v == 1.20)
 *
 * @param range - The version range string to parse
 * @returns Parsed range object, or undefined for exact match strings
 */
export function parseVersionRange(range: string): VersionRange | undefined {
  const trimmed = range.trim();

  // Check if it's a range (starts with [ or ()
  if (!trimmed.startsWith("[") && !trimmed.startsWith("(")) {
    return undefined; // Exact match, not a range
  }

  const minInclusive = trimmed.startsWith("[");
  const maxInclusive = trimmed.endsWith("]");

  // Extract the inner part (remove brackets)
  const inner = trimmed.slice(1, -1);
  const commaIndex = inner.indexOf(",");

  if (commaIndex === -1) {
    console.warn(`Invalid version range format: ${range}`);
    return undefined;
  }

  const minPart = inner.slice(0, commaIndex).trim();
  const maxPart = inner.slice(commaIndex + 1).trim();

  return {
    min: minPart || undefined,
    max: maxPart || undefined,
    minInclusive,
    maxInclusive,
  };
}

/**
 * Check if a version matches the given filter (exact version or Maven range).
 *
 * @param version - The version to check
 * @param filter - The filter to match against (specific version or Maven range)
 * @returns true if the version matches the filter
 */
export function matchesVersionFilter(version: string | undefined, filter: string): boolean {
  if (!version) {
    return false;
  }

  const range = parseVersionRange(filter);
  if (!range) {
    return version === filter;
  }

  const { min, max, minInclusive, maxInclusive } = range;
  if (min) {
    const cmp = compareVersions(version, min);
    if (minInclusive ? cmp < 0 : cmp <= 0) {
      return false;
    }
  }
  if (max) {
    const cmp = compareVersions(version, max);
    if (maxInclusive ? cmp > 0 : cmp >= 0) {
      return false;
    }
  }

  return true;
}

export function getEmbeddedMinecraftVersion(version: ParsedVersion | string) {
  if (typeof version === "string") {
    version = parseVersion(version) ?? {
      version,
    };
  }

  if (
    version.major === undefined ||
    version.minor === undefined ||
    version.patch === undefined
  ) {
    return undefined;
  }

  if (version.major <= 21) {
    return `1.${version.major}.${version.minor}`;
  } else if (version.major >= 26) {
    return `${version.major}.${version.minor}.${version.patch}`;
  } else {
    // Major versions 22-25 are not supported because they do not exist
    return undefined;
  }
}