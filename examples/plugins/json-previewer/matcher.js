export function match(context) {
  return parseJsonObjectSelection(context?.selectedText) !== null
}

function parseJsonObjectSelection(value) {
  if (typeof value !== "string") {
    return null
  }

  const sourceText = value.trim()
  if (!sourceText) {
    return null
  }

  const parsed = tryParseJson(sourceText)
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

  const decoded = tryParseJson(decodedText)
  if (!decoded.ok || !isJsonObject(decoded.value)) {
    return null
  }

  return {
    object: decoded.value,
    sourceText,
    sourceKind: "serialized-string",
  }
}

function tryParseJson(value) {
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
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
