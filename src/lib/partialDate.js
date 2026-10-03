// Birth/death dates aren't always known to the day — genealogical records
// routinely give just a year, or a year and month. Stored as the matching
// prefix of ISO 8601 (`YYYY`, `YYYY-MM`, or `YYYY-MM-DD`) rather than three
// separate year/month/day columns, since that's already a sortable,
// unambiguous text format with no extra modeling. See
// specs/edit-identity/spec.md.

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const PARTIAL_DATE_RE = /^(\d{4})(-(\d{2}))?(-(\d{2}))?$/

// Parses user input into a canonical partial-date string, or returns an
// error message. Empty input is valid (nothing recorded) and parses to
// `null`.
export function parsePartialDate(input) {
  const trimmed = (input ?? '').trim()
  if (!trimmed) return { value: null, error: null }

  const match = PARTIAL_DATE_RE.exec(trimmed)
  if (!match) {
    return { value: null, error: 'Use a year (1930), year-month (1930-06), or full date (1930-06-15)' }
  }

  const [, year, , month, , day] = match
  if (month && (Number(month) < 1 || Number(month) > 12)) {
    return { value: null, error: 'Month must be between 01 and 12' }
  }
  if (day) {
    const daysInMonth = new Date(Number(year), Number(month), 0).getDate()
    if (Number(day) < 1 || Number(day) > daysInMonth) {
      return { value: null, error: 'That day does not exist in that month' }
    }
  }

  return { value: trimmed, error: null }
}

// Renders a stored partial-date string for display, at whatever precision
// it was recorded: "1930", "Jun 1930", or "Jun 15, 1930".
export function formatPartialDate(value) {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  if (!month) return year
  const monthName = MONTH_NAMES[Number(month) - 1]
  if (!day) return `${monthName} ${year}`
  return `${monthName} ${Number(day)}, ${year}`
}
