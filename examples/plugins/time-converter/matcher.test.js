import { describe, expect, it } from "vitest"
import { match } from "./matcher.js"

describe("time converter matcher", () => {
  it.each([
    "1714298400",
    "1714298400000",
    "2026-04-28",
    "2026-04-28 10:30:00",
    "2026-04-28T10:30:00",
    "2026-04-28T10:30:00Z",
    "2026-04-28T10:30:00+08:00",
    "2026/04/28 10:30:00",
    "Tue, 28 Apr 2026 10:30:00 GMT",
  ])("accepts %s", (selectedText) => {
    expect(match({ selectedText })).toBe(true)
  })

  it.each([
    "",
    " ",
    "hello",
    "123456",
    "2026",
    "2026-02-30",
    "2026-04-31",
    "2026-13-01",
    "2026-04-28 24:00:00",
    "2026-04-28 10:60:00",
    "April 31, 2026",
    "Feb 30 2026",
    "Tue, 31 Apr 2026 10:30:00 GMT",
    "date: 2026-04-28",
    "foo 2026-04-28",
    "on Apr 28 2026",
    "next Apr 28 2026",
    "Apr 28",
    "28 Apr",
    "April 2026",
    "17142984000",
    "171429840000",
    "17142984000000",
    "tomorrow",
  ])("rejects %s", (selectedText) => {
    expect(match({ selectedText })).toBe(false)
  })

  it("trims the selected text before matching", () => {
    expect(match({ selectedText: "  1714298400\n" })).toBe(true)
  })

  it("rejects non-string context values", () => {
    expect(match({ selectedText: null })).toBe(false)
    expect(match({ selectedText: 1714298400 })).toBe(false)
    expect(match({})).toBe(false)
  })
})
