import { describe, expect, it } from "vitest"
import "./time-core.js"

const {
  formatLocalDate,
  formatLocalDateTime,
  formatTimeOutputs,
  formatTimePreview,
  parseTime,
} = globalThis.ohMySelectTimeCore

function expectLocalDateTime(
  date,
  { year, monthIndex, day, hour, minute, second = 0 }
) {
  expect(date.getFullYear()).toBe(year)
  expect(date.getMonth()).toBe(monthIndex)
  expect(date.getDate()).toBe(day)
  expect(date.getHours()).toBe(hour)
  expect(date.getMinutes()).toBe(minute)
  expect(date.getSeconds()).toBe(second)
}

describe("time core", () => {
  it("parses 10-digit Unix seconds", () => {
    const parsed = parseTime("1714298400")
    const outputs = formatTimeOutputs(parsed)

    expect(parsed.sourceKind).toBe("unix-seconds")
    expect(parsed.date.toISOString()).toBe("2024-04-28T10:00:00.000Z")
    expect(outputs.unixSeconds).toBe("1714298400")
    expect(outputs.milliseconds).toBe("1714298400000")
  })

  it("parses 13-digit millisecond timestamps", () => {
    const parsed = parseTime("1714298400000")

    expect(parsed.sourceKind).toBe("milliseconds")
    expect(parsed.date.toISOString()).toBe("2024-04-28T10:00:00.000Z")
  })

  it("parses date-only strings as local midnight", () => {
    const parsed = parseTime("2026-04-28")

    expect(parsed.sourceKind).toBe("local-string")
    expectLocalDateTime(parsed.date, {
      year: 2026,
      monthIndex: 3,
      day: 28,
      hour: 0,
      minute: 0,
    })
    expect(formatLocalDateTime(parsed.date)).toBe("2026-04-28 00:00:00")
    expect(formatLocalDate(parsed.date)).toBe("2026-04-28")
  })

  it("parses formatted strings without timezone as local time", () => {
    const parsed = parseTime("2026-04-28 10:30:00")

    expect(parsed.sourceKind).toBe("local-string")
    expectLocalDateTime(parsed.date, {
      year: 2026,
      monthIndex: 3,
      day: 28,
      hour: 10,
      minute: 30,
    })
  })

  it("parses ISO-like strings without timezone as local time", () => {
    const parsed = parseTime("2026-04-28T10:30:00")

    expect(parsed.sourceKind).toBe("local-string")
    expectLocalDateTime(parsed.date, {
      year: 2026,
      monthIndex: 3,
      day: 28,
      hour: 10,
      minute: 30,
    })
  })

  it("parses slash-separated strings without timezone as local time", () => {
    const parsed = parseTime("2026/04/28 10:30:00")

    expect(parsed.sourceKind).toBe("local-string")
    expectLocalDateTime(parsed.date, {
      year: 2026,
      monthIndex: 3,
      day: 28,
      hour: 10,
      minute: 30,
    })
  })

  it("parses timezone-aware ISO strings as absolute time", () => {
    const parsed = parseTime("2026-04-28T10:30:00Z")
    const outputs = formatTimeOutputs(parsed)

    expect(parsed.sourceKind).toBe("timezone-string")
    expect(outputs.isoUtc).toBe("2026-04-28T10:30:00.000Z")
    expect(outputs.rfc2822).toBe("Tue, 28 Apr 2026 10:30:00 GMT")
  })

  it("parses timezone offsets", () => {
    const parsed = parseTime("2026-04-28T10:30:00+08:00")

    expect(parsed.sourceKind).toBe("timezone-string")
    expect(parsed.date.toISOString()).toBe("2026-04-28T02:30:00.000Z")
  })

  it("parses RFC 2822 named-month values", () => {
    const parsed = parseTime("Tue, 28 Apr 2026 10:30:00 GMT")

    expect(parsed.sourceKind).toBe("timezone-string")
    expect(parsed.date.toISOString()).toBe("2026-04-28T10:30:00.000Z")
  })

  it("parses valid month-first named-month values", () => {
    const parsed = parseTime("April 28, 2026")

    expect(parsed.sourceKind).toBe("local-string")
    expectLocalDateTime(parsed.date, {
      year: 2026,
      monthIndex: 3,
      day: 28,
      hour: 0,
      minute: 0,
    })
  })

  it("parses named-month values with timezone as absolute time", () => {
    const parsed = parseTime("April 28, 2026 10:30:00 UTC")

    expect(parsed.sourceKind).toBe("timezone-string")
    expect(parsed.date.toISOString()).toBe("2026-04-28T10:30:00.000Z")
  })

  it("parses named-month values with numeric offsets as absolute time", () => {
    const parsed = parseTime("April 28, 2026 10:30:00 +08:00")

    expect(parsed.sourceKind).toBe("timezone-string")
    expect(parsed.date.toISOString()).toBe("2026-04-28T02:30:00.000Z")
  })

  it("formats all output rows", () => {
    const outputs = formatTimeOutputs(parseTime("2026-04-28T10:30:00Z"))

    expect(outputs).toEqual({
      unixSeconds: "1777372200",
      milliseconds: "1777372200000",
      isoUtc: "2026-04-28T10:30:00.000Z",
      localDateTime: formatLocalDateTime(new Date("2026-04-28T10:30:00Z")),
      localDate: formatLocalDate(new Date("2026-04-28T10:30:00Z")),
      rfc2822: "Tue, 28 Apr 2026 10:30:00 GMT",
    })
  })

  it("formats the local time preview", () => {
    const parsed = parseTime("2026-04-28 10:30:00")

    expect(formatTimePreview(parsed.date)).toBe("10:30")
  })

  it.each([
    "",
    "hello",
    "123456",
    "2026",
    "2026-02-30",
    "2026-04-31",
    "2026-13-01",
    "2026-04-28 24:00:00",
    "2026-04-28 10:60:00",
    "April 28, 2026 24:00",
    "April 28, 2026 10:60",
    "April 28, 2026 10:30:60",
    "April 31, 2026",
    "Feb 30 2026",
    "Mon, 28 Apr 2026 10:30:00 GMT",
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
    null,
  ])("returns null for unsupported value %s", (value) => {
    expect(parseTime(value)).toBeNull()
  })

  it("returns null outputs for null input", () => {
    expect(formatTimeOutputs(null)).toBeNull()
  })
})
