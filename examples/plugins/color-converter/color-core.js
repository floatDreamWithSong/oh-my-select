const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const DECIMAL_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)$/

export function parseColor(value) {
  const sourceText = typeof value === "string" ? value.trim() : ""

  return (
    parseHex(sourceText) ||
    parseRgb(sourceText) ||
    parseHsl(sourceText) ||
    parseOklch(sourceText)
  )
}

export function formatColorOutputs(color) {
  if (!color) {
    return null
  }

  const hsl = rgbToHsl(color.r, color.g, color.b)
  const oklch = rgbToOklch(color.r, color.g, color.b)

  return {
    hex: formatHex(color),
    rgb: formatRgb(color),
    hsl: `hsl(${formatNumber(hsl.h, 1)} ${formatNumber(
      hsl.s,
      1
    )}% ${formatNumber(hsl.l, 1)}%${formatAlphaPart(color)})`,
    oklch: `oklch(${formatNumber(oklch.l, 3)} ${formatNumber(
      oklch.c,
      3
    )} ${formatNumber(oklch.h, 1)}${formatAlphaPart(color)})`,
  }
}

export function colorToCss(color) {
  if (!color) {
    return "rgba(0, 0, 0, 0)"
  }

  return `rgba(${color.r}, ${color.g}, ${color.b}, ${formatAlpha(color.a)})`
}

function parseHex(value) {
  const match = HEX_RE.exec(value)
  if (!match) {
    return null
  }

  let hex = match[1].toUpperCase()
  const hasAlpha = hex.length === 4 || hex.length === 8

  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map((character) => character + character).join("")
  }

  return normalizeColor({
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: hasAlpha ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
    hasAlpha,
    sourceFormat: "HEX",
    sourceText: value,
  })
}

function parseRgb(value) {
  const parsed = parseFunction(value, ["rgb", "rgba"])
  if (!parsed) {
    return null
  }

  const args = splitColorArgs(parsed.body)
  if (!args || args.channels.length !== 3 || !isOptionalAlpha(args.alpha)) {
    return null
  }

  const channels = args.channels.map(parseByte)
  if (channels.some((channel) => channel === null)) {
    return null
  }

  return normalizeColor({
    r: channels[0],
    g: channels[1],
    b: channels[2],
    a: args.alpha === null ? 1 : parseAlpha(args.alpha),
    hasAlpha: args.alpha !== null,
    sourceFormat: "RGB",
    sourceText: value,
  })
}

function parseHsl(value) {
  const parsed = parseFunction(value, ["hsl", "hsla"])
  if (!parsed) {
    return null
  }

  const args = splitColorArgs(parsed.body)
  if (
    !args ||
    args.channels.length !== 3 ||
    parseDecimal(args.channels[0]) === null ||
    !isPercent(args.channels[1]) ||
    !isPercent(args.channels[2]) ||
    !isOptionalAlpha(args.alpha)
  ) {
    return null
  }

  const h = parseDecimal(args.channels[0])
  const s = parsePercent(args.channels[1])
  const l = parsePercent(args.channels[2])
  const rgb = hslToRgb(h, s, l)
  if (!rgb) {
    return null
  }

  return normalizeColor({
    ...rgb,
    a: args.alpha === null ? 1 : parseAlpha(args.alpha),
    hasAlpha: args.alpha !== null,
    sourceFormat: "HSL",
    sourceText: value,
  })
}

function parseOklch(value) {
  const parsed = parseFunction(value, ["oklch"])
  if (!parsed) {
    return null
  }

  const args = splitColorArgs(parsed.body)
  if (
    !args ||
    args.channels.length !== 3 ||
    !args.channels.every(isFiniteNumber) ||
    !isOptionalAlpha(args.alpha)
  ) {
    return null
  }

  const rgb = oklchToRgb(
    parseDecimal(args.channels[0]),
    parseDecimal(args.channels[1]),
    parseDecimal(args.channels[2])
  )

  return normalizeColor({
    ...rgb,
    a: args.alpha === null ? 1 : parseAlpha(args.alpha),
    hasAlpha: args.alpha !== null,
    sourceFormat: "OKLCH",
    sourceText: value,
  })
}

function parseFunction(value, names) {
  const match = /^([a-z]+)\((.*)\)$/i.exec(value)
  if (!match || !names.includes(match[1].toLowerCase())) {
    return null
  }

  return {
    name: match[1].toLowerCase(),
    body: match[2].trim(),
  }
}

function splitColorArgs(body) {
  if (!body) {
    return null
  }

  if (body.includes(",")) {
    const parts = body.split(",").map((part) => part.trim())
    if (
      (parts.length !== 3 && parts.length !== 4) ||
      parts.some((part) => !part)
    ) {
      return null
    }

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
  const alpha = slashParts.length === 2 ? slashParts[1].trim() : null
  if (channels.length === 0 || alpha === "") {
    return null
  }

  return { channels, alpha }
}

function parseByte(value) {
  const numeric = parseDecimal(value)
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 255) {
    return null
  }

  return clamp(Math.round(numeric), 0, 255)
}

function parsePercent(value) {
  if (!isPercent(value)) {
    return null
  }

  return parseDecimal(value.slice(0, -1))
}

function parseAlpha(value) {
  if (value.endsWith("%")) {
    return parseDecimal(value.slice(0, -1)) / 100
  }

  return parseDecimal(value)
}

function isOptionalAlpha(value) {
  return value === null || isAlpha(value)
}

function isAlpha(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false
  }

  if (value.endsWith("%")) {
    const numeric = parseDecimal(value.slice(0, -1))
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100
  }

  const numeric = parseDecimal(value)
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1
}

function isPercent(value) {
  if (typeof value !== "string" || !value.endsWith("%")) {
    return false
  }

  const numeric = parseDecimal(value.slice(0, -1))
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100
}

function isFiniteNumber(value) {
  return Number.isFinite(parseDecimal(value))
}

function parseDecimal(value) {
  if (typeof value !== "string" || !DECIMAL_RE.test(value)) {
    return null
  }

  return Number(value)
}

function normalizeColor(color) {
  if (
    [color.r, color.g, color.b, color.a].some(
      (channel) => !Number.isFinite(channel)
    )
  ) {
    return null
  }

  return {
    r: clamp(Math.round(color.r), 0, 255),
    g: clamp(Math.round(color.g), 0, 255),
    b: clamp(Math.round(color.b), 0, 255),
    a: clamp(color.a, 0, 1),
    hasAlpha: color.hasAlpha,
    sourceFormat: color.sourceFormat,
    sourceText: color.sourceText,
  }
}

function formatHex(color) {
  const alpha = shouldFormatAlpha(color)
    ? toHexByte(Math.round(color.a * 255))
    : ""

  return `#${toHexByte(color.r)}${toHexByte(color.g)}${toHexByte(color.b)}${alpha}`
}

function formatRgb(color) {
  return `rgb(${color.r} ${color.g} ${color.b}${formatAlphaPart(color)})`
}

function formatAlphaPart(color) {
  return shouldFormatAlpha(color) ? ` / ${formatAlpha(color.a)}` : ""
}

function shouldFormatAlpha(color) {
  return color.hasAlpha || color.a < 1
}

function formatAlpha(alpha) {
  return formatNumber(alpha, 3)
}

function formatNumber(value, precision) {
  return Number(value.toFixed(precision)).toString()
}

function toHexByte(value) {
  return clamp(value, 0, 255).toString(16).padStart(2, "0").toUpperCase()
}

function hslToRgb(h, s, l) {
  if (![h, s, l].every(Number.isFinite)) {
    return null
  }

  const hue = wrapHue(h) / 360
  const saturation = s / 100
  const lightness = l / 100

  if (saturation === 0) {
    const channel = lightness * 255
    return { r: channel, g: channel, b: channel }
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q

  return {
    r: hueToRgb(p, q, hue + 1 / 3) * 255,
    g: hueToRgb(p, q, hue) * 255,
    b: hueToRgb(p, q, hue - 1 / 3) * 255,
  }
}

function hueToRgb(p, q, t) {
  let wrapped = t
  if (wrapped < 0) {
    wrapped += 1
  }
  if (wrapped > 1) {
    wrapped -= 1
  }
  if (wrapped < 1 / 6) {
    return p + (q - p) * 6 * wrapped
  }
  if (wrapped < 1 / 2) {
    return q
  }
  if (wrapped < 2 / 3) {
    return p + (q - p) * (2 / 3 - wrapped) * 6
  }
  return p
}

function rgbToHsl(r, g, b) {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2

  if (max === min) {
    return { h: 0, s: 0, l: lightness * 100 }
  }

  const delta = max - min
  const saturation =
    lightness > 0.5
      ? delta / (2 - max - min)
      : delta / (max + min)
  let hue

  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0)
  } else if (max === green) {
    hue = (blue - red) / delta + 2
  } else {
    hue = (red - green) / delta + 4
  }

  return {
    h: hue * 60,
    s: saturation * 100,
    l: lightness * 100,
  }
}

function oklchToRgb(l, c, h) {
  const hue = (wrapHue(h) * Math.PI) / 180
  const a = Math.cos(hue) * c
  const b = Math.sin(hue) * c
  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b
  const long = lPrime ** 3
  const medium = mPrime ** 3
  const short = sPrime ** 3

  return {
    r: linearToSrgb(
      4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short
    ),
    g: linearToSrgb(
      -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short
    ),
    b: linearToSrgb(
      -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short
    ),
  }
}

function rgbToOklch(r, g, b) {
  const red = srgbToLinear(r / 255)
  const green = srgbToLinear(g / 255)
  const blue = srgbToLinear(b / 255)
  const long = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
  const medium =
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
  const short = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
  const longRoot = Math.cbrt(long)
  const mediumRoot = Math.cbrt(medium)
  const shortRoot = Math.cbrt(short)
  const lightness =
    0.2104542553 * longRoot +
    0.793617785 * mediumRoot -
    0.0040720468 * shortRoot
  const a =
    1.9779984951 * longRoot -
    2.428592205 * mediumRoot +
    0.4505937099 * shortRoot
  const bAxis =
    0.0259040371 * longRoot +
    0.7827717662 * mediumRoot -
    0.808675766 * shortRoot
  const chroma = Math.sqrt(a ** 2 + bAxis ** 2)
  const hue = wrapHue((Math.atan2(bAxis, a) * 180) / Math.PI)

  return { l: lightness, c: chroma, h: hue }
}

function srgbToLinear(value) {
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value) {
  const normalized =
    value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055

  return clamp(Math.round(normalized * 255), 0, 255)
}

function wrapHue(value) {
  return ((value % 360) + 360) % 360
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
