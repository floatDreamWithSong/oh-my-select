import { describe, expect, it } from "vitest"
import { match } from "./matcher.js"

describe("color converter matcher", () => {
  it.each([
    "#fff",
    "#FFFF",
    "#22c55e",
    "#22C55Ecc",
    "rgb(34, 197, 94)",
    "rgba(34, 197, 94, .8)",
    "rgb(34 197 94 / 80%)",
    "hsl(142 71% 45%)",
    "hsla(142, 71%, 45%, .8)",
    "oklch(0.72 0.19 149.6)",
    "oklch(0.72 0.19 149.6 / .8)",
  ])("accepts %s", (selectedText) => {
    expect(match({ selectedText })).toBe(true)
  })

  it.each([
    "",
    "hello",
    "123456",
    "rgb()",
    "rgba(34, 197)",
    "rgb(34 197 94 / 140%)",
    "hsl(142 71 45)",
    "oklch(0.72 0.19)",
    "#12",
    "#xyzxyz",
  ])("rejects %s", (selectedText) => {
    expect(match({ selectedText })).toBe(false)
  })

  it("trims the selected text before matching", () => {
    expect(match({ selectedText: "  #22c55e\n" })).toBe(true)
  })

  it("rejects non-string context values", () => {
    expect(match({ selectedText: null })).toBe(false)
    expect(match({})).toBe(false)
  })
})
