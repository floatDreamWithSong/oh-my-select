export function match(context) {
  const selectedText =
    typeof context?.selectedText === "string" ? context.selectedText.trim() : ""

  return isSupportedColor(selectedText)
}

function isSupportedColor(value) {
  return (
    isHexColor(value) ||
    isRgbColor(value) ||
    isHslColor(value) ||
    isOklchColor(value)
  )
}

function isHexColor(value) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(
    value
  )
}

function isRgbColor(value) {
  const parsed = parseFunction(value, ["rgb", "rgba"])
  if (!parsed) {
    return false
  }

  const args = splitColorArgs(parsed.body)
  return (
    args !== null &&
    args.channels.length === 3 &&
    args.channels.every(isByte) &&
    isOptionalAlpha(args.alpha)
  )
}

function isHslColor(value) {
  const parsed = parseFunction(value, ["hsl", "hsla"])
  if (!parsed) {
    return false
  }

  const args = splitColorArgs(parsed.body)
  return (
    args !== null &&
    args.channels.length === 3 &&
    isFiniteNumber(args.channels[0]) &&
    isPercent(args.channels[1]) &&
    isPercent(args.channels[2]) &&
    isOptionalAlpha(args.alpha)
  )
}

function isOklchColor(value) {
  const parsed = parseFunction(value, ["oklch"])
  if (!parsed) {
    return false
  }

  const args = splitColorArgs(parsed.body)
  return (
    args !== null &&
    args.channels.length === 3 &&
    args.channels.every(isFiniteNumber) &&
    isOptionalAlpha(args.alpha)
  )
}

function parseFunction(value, names) {
  const matchResult = /^([a-z]+)\((.*)\)$/i.exec(value)
  if (!matchResult || !names.includes(matchResult[1].toLowerCase())) {
    return null
  }

  return {
    name: matchResult[1].toLowerCase(),
    body: matchResult[2].trim(),
  }
}

function splitColorArgs(body) {
  if (!body) {
    return null
  }

  if (body.includes(",")) {
    const parts = body
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)

    return {
      channels: parts.slice(0, 3),
      alpha: parts.length === 4 ? parts[3] : null,
    }
  }

  const slashParts = body.split("/")
  if (slashParts.length > 2) {
    return null
  }

  const channels = slashParts[0].trim().split(/\s+/).filter(Boolean)
  return {
    channels,
    alpha: slashParts.length === 2 ? slashParts[1].trim() : null,
  }
}

function isOptionalAlpha(value) {
  return value === null || isAlpha(value)
}

function isAlpha(value) {
  if (value.endsWith("%")) {
    const numeric = Number(value.slice(0, -1))
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100
  }

  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1
}

function isByte(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 255
}

function isPercent(value) {
  if (!value.endsWith("%")) {
    return false
  }

  const numeric = Number(value.slice(0, -1))
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value))
}
