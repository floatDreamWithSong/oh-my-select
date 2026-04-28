;(function () {
  const LOCAL_NUMERIC_RE =
    /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?)?$/
  const ISO_TIMEZONE_RE =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?(Z|[+-]\d{2}:?\d{2})$/
  const MONTH_NAME_PATTERN =
    "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
  const WEEKDAY_PATTERN =
    "(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)"
  const NAMED_MONTH_TIME_PART_PATTERN =
    "(?:\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d{1,3}))?)?(?:\\s*(GMT|UTC|[+-]\\d{2}:?\\d{2}))?)?"
  const MONTH_NAME_RE = new RegExp(`\\b${MONTH_NAME_PATTERN}\\b`, "i")
  const MONTH_FIRST_DATE_RE = new RegExp(
    `^(${MONTH_NAME_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(\\d{4})${NAMED_MONTH_TIME_PART_PATTERN}$`,
    "i"
  )
  const DAY_FIRST_DATE_RE = new RegExp(
    `^(${WEEKDAY_PATTERN},\\s*)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAME_PATTERN})(?:,)?\\s+(\\d{4})${NAMED_MONTH_TIME_PART_PATTERN}$`,
    "i"
  )
  const MONTH_BY_NAME = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  }
  const WEEKDAY_BY_NAME = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
  }

  globalThis.ohMySelectTimeCore = {
    formatLocalDate,
    formatLocalDateTime,
    formatTimeOutputs,
    formatTimePreview,
    parseTime,
  }

  function parseTime(value) {
    const sourceText = typeof value === "string" ? value.trim() : ""
    if (!sourceText) {
      return null
    }

    if (/^\d+$/.test(sourceText)) {
      return parseTimestamp(sourceText)
    }

    const localMatch = LOCAL_NUMERIC_RE.exec(sourceText)
    if (localMatch) {
      const date = dateFromLocalMatch(localMatch)
      return date ? createTime(date, "local-string") : null
    }

    if (MONTH_NAME_RE.test(sourceText)) {
      return parseNamedMonthTime(sourceText)
    }

    const timezoneMatch = ISO_TIMEZONE_RE.exec(sourceText)
    if (timezoneMatch) {
      return parseIsoTimezoneTime(sourceText, timezoneMatch)
    }

    return null
  }

  function formatTimeOutputs(time) {
    const date = dateFromTime(time)
    if (!isValidDate(date)) {
      return null
    }

    return {
      unixSeconds: String(Math.floor(date.getTime() / 1000)),
      milliseconds: String(date.getTime()),
      isoUtc: date.toISOString(),
      localDateTime: formatLocalDateTime(date),
      localDate: formatLocalDate(date),
      rfc2822: date.toUTCString(),
    }
  }

  function formatLocalDateTime(date) {
    if (!isValidDate(date)) {
      return ""
    }

    return `${formatLocalDate(date)} ${pad2(date.getHours())}:${pad2(
      date.getMinutes()
    )}:${pad2(date.getSeconds())}`
  }

  function formatLocalDate(date) {
    if (!isValidDate(date)) {
      return ""
    }

    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
      date.getDate()
    )}`
  }

  function formatTimePreview(date) {
    if (!isValidDate(date)) {
      return "--:--"
    }

    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  }

  function parseTimestamp(value) {
    if (value.length !== 10 && value.length !== 13) {
      return null
    }

    const numeric = Number(value)
    if (!Number.isSafeInteger(numeric)) {
      return null
    }

    const milliseconds = value.length === 10 ? numeric * 1000 : numeric
    const date = new Date(milliseconds)
    if (!isValidDate(date)) {
      return null
    }

    return createTime(
      date,
      value.length === 10 ? "unix-seconds" : "milliseconds"
    )
  }

  function parseIsoTimezoneTime(value, matchResult) {
    if (!hasValidDateTimeParts(matchResult)) {
      return null
    }

    const date = new Date(value)
    return isValidDate(date) ? createTime(date, "timezone-string") : null
  }

  function parseNamedMonthTime(value) {
    const dateParts = getNamedMonthDateParts(value)
    if (!dateParts || !hasValidNamedMonthParts(dateParts)) {
      return null
    }

    const date = dateFromNamedMonthParts(dateParts)
    if (!isValidDate(date)) {
      return null
    }

    return createTime(
      date,
      dateParts.timezone ? "timezone-string" : "local-string"
    )
  }

  function dateFromLocalMatch(matchResult) {
    const year = Number(matchResult[1])
    const month = Number(matchResult[3])
    const day = Number(matchResult[4])
    const hour = matchResult[5] === undefined ? 0 : Number(matchResult[5])
    const minute = matchResult[6] === undefined ? 0 : Number(matchResult[6])
    const second = matchResult[7] === undefined ? 0 : Number(matchResult[7])
    const millisecond =
      matchResult[8] === undefined ? 0 : Number(matchResult[8].padEnd(3, "0"))

    if (
      !isValidDateParts(year, month, day) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59 ||
      second < 0 ||
      second > 59 ||
      millisecond < 0 ||
      millisecond > 999
    ) {
      return null
    }

    const date = new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
      millisecond
    )

    return date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day &&
      date.getHours() === hour &&
      date.getMinutes() === minute &&
      date.getSeconds() === second &&
      date.getMilliseconds() === millisecond
      ? date
      : null
  }

  function hasValidDateTimeParts(matchResult) {
    const year = Number(matchResult[1])
    const month = Number(matchResult[2])
    const day = Number(matchResult[3])
    const hour = matchResult[4] === undefined ? 0 : Number(matchResult[4])
    const minute = matchResult[5] === undefined ? 0 : Number(matchResult[5])
    const second = matchResult[6] === undefined ? 0 : Number(matchResult[6])
    const millisecond =
      matchResult[7] === undefined ? 0 : Number(matchResult[7].padEnd(3, "0"))

    return (
      isValidDateParts(year, month, day) &&
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59 &&
      second >= 0 &&
      second <= 59 &&
      millisecond >= 0 &&
      millisecond <= 999
    )
  }

  function getNamedMonthDateParts(value) {
    const monthFirstMatch = MONTH_FIRST_DATE_RE.exec(value)
    if (monthFirstMatch) {
      return {
        year: Number(monthFirstMatch[3]),
        month: monthNumberFromName(monthFirstMatch[1]),
        day: Number(monthFirstMatch[2]),
        hour: parseOptionalNumber(monthFirstMatch[4], 0),
        minute: parseOptionalNumber(monthFirstMatch[5], 0),
        second: parseOptionalNumber(monthFirstMatch[6], 0),
        millisecond: parseOptionalMillisecond(monthFirstMatch[7]),
        timezone: monthFirstMatch[8],
        weekday: null,
      }
    }

    const dayFirstMatch = DAY_FIRST_DATE_RE.exec(value)
    if (dayFirstMatch) {
      const weekday = dayFirstMatch[1]
        ? dayFirstMatch[1].replace(/,\s*$/, "")
        : null

      return {
        year: Number(dayFirstMatch[4]),
        month: monthNumberFromName(dayFirstMatch[3]),
        day: Number(dayFirstMatch[2]),
        hour: parseOptionalNumber(dayFirstMatch[5], 0),
        minute: parseOptionalNumber(dayFirstMatch[6], 0),
        second: parseOptionalNumber(dayFirstMatch[7], 0),
        millisecond: parseOptionalMillisecond(dayFirstMatch[8]),
        timezone: dayFirstMatch[9],
        weekday,
      }
    }

    return null
  }

  function monthNumberFromName(value) {
    return MONTH_BY_NAME[value.toLowerCase()] ?? null
  }

  function hasValidNamedMonthParts(dateParts) {
    return (
      isValidDateParts(dateParts.year, dateParts.month, dateParts.day) &&
      isValidTimeParts(dateParts) &&
      isValidTimezone(dateParts.timezone) &&
      hasMatchingWeekday(dateParts)
    )
  }

  function dateFromNamedMonthParts(dateParts) {
    if (dateParts.timezone) {
      const date = new Date(
        `${dateParts.year}-${pad2(dateParts.month)}-${pad2(
          dateParts.day
        )}T${pad2(dateParts.hour)}:${pad2(dateParts.minute)}:${pad2(
          dateParts.second
        )}.${pad3(dateParts.millisecond)}${normalizeTimezone(
          dateParts.timezone
        )}`
      )

      return isValidDate(date) ? date : null
    }

    const date = new Date(
      dateParts.year,
      dateParts.month - 1,
      dateParts.day,
      dateParts.hour,
      dateParts.minute,
      dateParts.second,
      dateParts.millisecond
    )

    return date.getFullYear() === dateParts.year &&
      date.getMonth() === dateParts.month - 1 &&
      date.getDate() === dateParts.day &&
      date.getHours() === dateParts.hour &&
      date.getMinutes() === dateParts.minute &&
      date.getSeconds() === dateParts.second &&
      date.getMilliseconds() === dateParts.millisecond
      ? date
      : null
  }

  function isValidTimeParts({ hour, minute, second, millisecond }) {
    return (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59 &&
      second >= 0 &&
      second <= 59 &&
      millisecond >= 0 &&
      millisecond <= 999
    )
  }

  function isValidTimezone(timezone) {
    if (!timezone || /^(?:GMT|UTC)$/i.test(timezone)) {
      return true
    }

    const matchResult = /^([+-])(\d{2}):?(\d{2})$/.exec(timezone)
    if (!matchResult) {
      return false
    }

    const hour = Number(matchResult[2])
    const minute = Number(matchResult[3])
    return hour <= 23 && minute <= 59
  }

  function hasMatchingWeekday(dateParts) {
    if (!dateParts.weekday) {
      return true
    }

    return (
      weekdayNumberFromName(dateParts.weekday) ===
      new Date(
        Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)
      ).getUTCDay()
    )
  }

  function weekdayNumberFromName(value) {
    return WEEKDAY_BY_NAME[value.toLowerCase()] ?? null
  }

  function normalizeTimezone(timezone) {
    if (/^(?:GMT|UTC)$/i.test(timezone)) {
      return "Z"
    }

    return timezone.length === 5
      ? `${timezone.slice(0, 3)}:${timezone.slice(3)}`
      : timezone
  }

  function parseOptionalNumber(value, fallback) {
    return value === undefined ? fallback : Number(value)
  }

  function parseOptionalMillisecond(value) {
    return value === undefined ? 0 : Number(value.padEnd(3, "0"))
  }

  function isValidDateParts(year, month, day) {
    if (month < 1 || month > 12 || day < 1) {
      return false
    }

    return day <= daysInMonth(year, month)
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate()
  }

  function createTime(date, sourceKind) {
    return { date, sourceKind }
  }

  function dateFromTime(time) {
    if (time instanceof Date) {
      return time
    }

    return time?.date
  }

  function isValidDate(date) {
    return date instanceof Date && Number.isFinite(date.getTime())
  }

  function pad2(value) {
    return String(value).padStart(2, "0")
  }

  function pad3(value) {
    return String(value).padStart(3, "0")
  }
})()
