import { describe, expect, it } from "vitest"
import {
  colorToCss,
  formatColorOutputs,
  parseColor,
} from "./color-core.js"

describe("color core", () => {
  it("parses HEX case-insensitively and outputs uppercase HEX", () => {
    const color = parseColor("#22c55ecc")

    expect(color).toMatchObject({
      r: 34,
      g: 197,
      b: 94,
      sourceFormat: "HEX",
    })
    expect(color.a).toBeCloseTo(0.8, 5)
    expect(formatColorOutputs(color).hex).toBe("#22C55ECC")
  })

  it("expands short HEX values", () => {
    expect(formatColorOutputs(parseColor("#fff")).hex).toBe("#FFFFFF")
    expect(formatColorOutputs(parseColor("#FFFF")).hex).toBe("#FFFFFFFF")
  })

  it("parses RGB comma and modern slash syntax", () => {
    expect(formatColorOutputs(parseColor("rgb(34, 197, 94)")).rgb).toBe(
      "rgb(34 197 94)"
    )
    expect(formatColorOutputs(parseColor("rgb(34 197 94 / 80%)")).rgb).toBe(
      "rgb(34 197 94 / 0.8)"
    )
  })

  it("parses HSL and converts it to RGB", () => {
    const outputs = formatColorOutputs(parseColor("hsl(142 71% 45%)"))

    expect(outputs.hex).toBe("#21C45D")
    expect(outputs.rgb).toBe("rgb(33 196 93)")
  })

  it("parses OKLCH values", () => {
    const color = parseColor("oklch(0.72 0.19 149.6 / .8)")
    const outputs = formatColorOutputs(color)

    expect(color.sourceFormat).toBe("OKLCH")
    expect(color.a).toBeCloseTo(0.8, 5)
    expect(outputs.oklch).toContain(" / 0.8)")
    expect(outputs.hex).toMatch(/^#[0-9A-F]{8}$/)
  })

  it("returns null for unsupported values", () => {
    expect(parseColor("hello")).toBeNull()
    expect(parseColor("#12")).toBeNull()
    expect(parseColor("rgb()")).toBeNull()
    expect(parseColor("rgb(34 197 94 / )")).toBeNull()
    expect(parseColor("rgb(0x22 197 94)")).toBeNull()
    expect(parseColor("rgba(34, 197, 94, 0x1)")).toBeNull()
    expect(parseColor("oklch(0x1 0.19 149.6)")).toBeNull()
    expect(parseColor("rgb(34,,197,94)")).toBeNull()
    expect(parseColor("rgb(34,197,94,)")).toBeNull()
    expect(parseColor("rgb(34,197,94,0.5,0.6)")).toBeNull()
  })

  it("returns a CSS rgba color for swatch rendering", () => {
    expect(colorToCss(parseColor("rgba(34, 197, 94, .8)"))).toBe(
      "rgba(34, 197, 94, 0.8)"
    )
  })
})
