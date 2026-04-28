import { describe, expect, it } from "vitest"
import "./json-core.js"

const {
  DEFAULT_INDENT,
  formatObject,
  indentOrDefault,
  normalizeIndent,
  parseJsonObjectSelection,
  serializeObject,
} = globalThis.ohMySelectJsonCore

describe("json previewer core", () => {
  it("parses direct JSON objects", () => {
    const parsed = parseJsonObjectSelection(' { "a": 1, "nested": { "b": true } } ')

    expect(parsed).toEqual({
      object: {
        a: 1,
        nested: {
          b: true,
        },
      },
      sourceText: '{ "a": 1, "nested": { "b": true } }',
      sourceKind: "object",
    })
  })

  it("parses serialized JSON strings that decode to objects", () => {
    const selectedText = JSON.stringify(JSON.stringify({ a: 1, b: "two" }))
    const parsed = parseJsonObjectSelection(selectedText)

    expect(parsed).toEqual({
      object: {
        a: 1,
        b: "two",
      },
      sourceText: selectedText,
      sourceKind: "serialized-string",
    })
  })

  it("rejects unsupported JSON values", () => {
    expect(parseJsonObjectSelection('[{"a":1}]')).toBeNull()
    expect(parseJsonObjectSelection('"hello"')).toBeNull()
    expect(parseJsonObjectSelection("123")).toBeNull()
    expect(parseJsonObjectSelection("null")).toBeNull()
    expect(parseJsonObjectSelection("true")).toBeNull()
    expect(parseJsonObjectSelection('{"a":1} trailing')).toBeNull()
    expect(parseJsonObjectSelection("")).toBeNull()
    expect(parseJsonObjectSelection(null)).toBeNull()
  })

  it("rejects serialized strings that do not decode to objects", () => {
    expect(parseJsonObjectSelection(JSON.stringify("hello"))).toBeNull()
    expect(parseJsonObjectSelection(JSON.stringify("[1,2,3]"))).toBeNull()
    expect(parseJsonObjectSelection(JSON.stringify("123"))).toBeNull()
  })

  it("formats objects with configured indentation", () => {
    expect(formatObject({ a: 1 }, 2)).toBe('{\n  "a": 1\n}')
    expect(formatObject({ a: 1 }, 0)).toBe('{"a":1}')
  })

  it("serializes objects as JSON string literals containing compact object JSON", () => {
    expect(serializeObject({ a: 1, b: "two" })).toBe(
      '"{\\"a\\":1,\\"b\\":\\"two\\"}"'
    )
  })

  it("normalizes valid indentation values", () => {
    expect(DEFAULT_INDENT).toBe(2)
    expect(normalizeIndent(0)).toBe(0)
    expect(normalizeIndent(2)).toBe(2)
    expect(normalizeIndent(8)).toBe(8)
    expect(normalizeIndent("4")).toBe(4)
    expect(normalizeIndent(" 6 ")).toBe(6)
  })

  it("rejects invalid indentation values", () => {
    expect(normalizeIndent("")).toBeNull()
    expect(normalizeIndent("  ")).toBeNull()
    expect(normalizeIndent(-1)).toBeNull()
    expect(normalizeIndent(9)).toBeNull()
    expect(normalizeIndent(2.5)).toBeNull()
    expect(normalizeIndent("2.5")).toBeNull()
    expect(normalizeIndent("abc")).toBeNull()
    expect(normalizeIndent(null)).toBeNull()
  })

  it("falls back to the default indentation", () => {
    expect(indentOrDefault("bad")).toBe(2)
    expect(indentOrDefault(4)).toBe(4)
  })
})
