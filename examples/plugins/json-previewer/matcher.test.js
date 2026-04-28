import { describe, expect, it } from "vitest"
import { match } from "./matcher.js"

describe("json previewer matcher", () => {
  it.each([
    '{"name":"oh-my-select","enabled":true}',
    '  { "nested": { "count": 2 } }  ',
    JSON.stringify(JSON.stringify({ name: "oh-my-select", enabled: true })),
  ])("accepts %s", (selectedText) => {
    expect(match({ selectedText })).toBe(true)
  })

  it.each([
    "",
    "hello",
    '[{"a":1}]',
    '"hello"',
    "123",
    "null",
    "true",
    '{"a":1} trailing',
    JSON.stringify("[1,2,3]"),
    JSON.stringify("hello"),
  ])("rejects %s", (selectedText) => {
    expect(match({ selectedText })).toBe(false)
  })

  it("rejects non-string context values", () => {
    expect(match({ selectedText: null })).toBe(false)
    expect(match({ selectedText: 123 })).toBe(false)
    expect(match({})).toBe(false)
  })
})
