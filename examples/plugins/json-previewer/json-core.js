;(function () {
  const DEFAULT_INDENT = 2
  const MIN_INDENT = 0
  const MAX_INDENT = 8

  globalThis.ohMySelectJsonCore = {
    DEFAULT_INDENT,
    MIN_INDENT,
    MAX_INDENT,
    parseJsonObjectSelection,
    formatObject,
    serializeObject,
    normalizeIndent,
    indentOrDefault,
  }

  function parseJsonObjectSelection(value) {
    if (typeof value !== "string") {
      return null
    }

    const sourceText = value.trim()
    if (!sourceText) {
      return null
    }

    const parsed = parseJson(sourceText)
    if (!parsed.ok) {
      return null
    }

    if (isJsonObject(parsed.value)) {
      return {
        object: parsed.value,
        sourceText,
        sourceKind: "object",
      }
    }

    if (typeof parsed.value !== "string") {
      return null
    }

    const decodedText = parsed.value.trim()
    if (!decodedText) {
      return null
    }

    const decoded = parseJson(decodedText)
    if (!decoded.ok || !isJsonObject(decoded.value)) {
      return null
    }

    return {
      object: decoded.value,
      sourceText,
      sourceKind: "serialized-string",
    }
  }

  function formatObject(object, indent) {
    return JSON.stringify(object, null, indentOrDefault(indent))
  }

  function serializeObject(object) {
    return JSON.stringify(JSON.stringify(object))
  }

  function normalizeIndent(value) {
    if (typeof value === "string" && value.trim() === "") {
      return null
    }

    const numeric = typeof value === "string" ? Number(value.trim()) : value
    if (
      !Number.isInteger(numeric) ||
      numeric < MIN_INDENT ||
      numeric > MAX_INDENT
    ) {
      return null
    }

    return numeric
  }

  function indentOrDefault(value) {
    return normalizeIndent(value) ?? DEFAULT_INDENT
  }

  function parseJson(value) {
    try {
      return {
        ok: true,
        value: JSON.parse(value),
      }
    } catch {
      return {
        ok: false,
        value: null,
      }
    }
  }

  function isJsonObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
  }
})()
