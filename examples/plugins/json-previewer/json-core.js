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
    highlightJson,
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

  function highlightJson(value) {
    const source = String(value)
    let highlighted = ""

    for (let index = 0; index < source.length; ) {
      const character = source[index]

      if (character === '"') {
        const tokenEnd = readJsonStringEnd(source, index)
        const token = source.slice(index, tokenEnd)
        const nextTokenIndex = findNextNonWhitespaceIndex(source, tokenEnd)
        const className =
          source[nextTokenIndex] === ":" ? "json-key" : "json-string"

        highlighted += wrapToken(className, token)
        index = tokenEnd
        continue
      }

      if (isNumberStart(character)) {
        const tokenEnd = readJsonNumberEnd(source, index)
        highlighted += wrapToken("json-number", source.slice(index, tokenEnd))
        index = tokenEnd
        continue
      }

      if (matchesJsonLiteral(source, index, "true")) {
        highlighted += wrapToken("json-boolean", "true")
        index += 4
        continue
      }

      if (matchesJsonLiteral(source, index, "false")) {
        highlighted += wrapToken("json-boolean", "false")
        index += 5
        continue
      }

      if (matchesJsonLiteral(source, index, "null")) {
        highlighted += wrapToken("json-null", "null")
        index += 4
        continue
      }

      if (character === ":") {
        highlighted += wrapToken("json-colon", character)
        index += 1
        continue
      }

      if (isJsonPunctuation(character)) {
        highlighted += wrapToken("json-punctuation", character)
        index += 1
        continue
      }

      highlighted += escapeHtml(character)
      index += 1
    }

    return highlighted
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

  function readJsonStringEnd(source, startIndex) {
    for (let index = startIndex + 1; index < source.length; index += 1) {
      if (source[index] === "\\") {
        index += 1
        continue
      }

      if (source[index] === '"') {
        return index + 1
      }
    }

    return source.length
  }

  function readJsonNumberEnd(source, startIndex) {
    let index = startIndex

    if (source[index] === "-") {
      index += 1
    }

    while (isDigit(source[index])) {
      index += 1
    }

    if (source[index] === ".") {
      index += 1
      while (isDigit(source[index])) {
        index += 1
      }
    }

    if (source[index] === "e" || source[index] === "E") {
      index += 1
      if (source[index] === "+" || source[index] === "-") {
        index += 1
      }
      while (isDigit(source[index])) {
        index += 1
      }
    }

    return index
  }

  function findNextNonWhitespaceIndex(source, startIndex) {
    let index = startIndex
    while (/\s/.test(source[index] || "")) {
      index += 1
    }
    return index
  }

  function matchesJsonLiteral(source, index, literal) {
    return (
      source.startsWith(literal, index) &&
      !/[A-Za-z0-9_$]/.test(source[index + literal.length] || "")
    )
  }

  function isNumberStart(character) {
    return character === "-" || isDigit(character)
  }

  function isDigit(character) {
    return character >= "0" && character <= "9"
  }

  function isJsonPunctuation(character) {
    return (
      character === "{" ||
      character === "}" ||
      character === "[" ||
      character === "]" ||
      character === ","
    )
  }

  function wrapToken(className, token) {
    return `<span class="${className}">${escapeHtml(token)}</span>`
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")
  }
})()
