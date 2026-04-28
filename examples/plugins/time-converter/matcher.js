export function match(context) {
  const selectedText =
    typeof context?.selectedText === "string" ? context.selectedText.trim() : ""

  return parseSupportedTime(selectedText) !== null
}

const LOCAL_NUMERIC_RE =
  /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?)?$/
const ISO_DATE_PARTS_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?)?/

function parseSupportedTime(value) {
  if (!value) {
    return null
  }

  if (/^\d+$/.test(value)) {
    return parseTimestamp(value)
  }

  const localMatch = LOCAL_NUMERIC_RE.exec(value)
  if (localMatch) {
    return dateFromLocalMatch(localMatch)
  }

  if (!looksLikeFormattedTime(value)) {
    return null
  }

  if (!hasValidIsoDateParts(value)) {
    return null
  }

  const date = new Date(value)
  return isValidDate(date) ? date : null
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
  return isValidDate(date) ? date : null
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

function looksLikeFormattedTime(value) {
  return (
    /[A-Za-z]/.test(value) ||
    /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(value) ||
    /\d{1,2}\s+[A-Za-z]{3,}/.test(value)
  )
}

function hasValidIsoDateParts(value) {
  const matchResult = ISO_DATE_PARTS_RE.exec(value)
  if (!matchResult) {
    return true
  }

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

function isValidDateParts(year, month, day) {
  if (month < 1 || month > 12 || day < 1) {
    return false
  }

  return day <= daysInMonth(year, month)
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function isValidDate(date) {
  return date instanceof Date && Number.isFinite(date.getTime())
}
