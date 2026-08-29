const DAY_MS = 24 * 60 * 60 * 1000

function localCalendarDay(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

export function formatSmartDate(iso: string, reference = new Date()) {
  const date = new Date(iso)
  const daysAgo = Math.round(
    (localCalendarDay(reference) - localCalendarDay(date)) / DAY_MS,
  )
  const calendarDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)

  if (daysAgo === 0) return `${calendarDate}, Today`
  if (daysAgo === 1) return `${calendarDate}, Yesterday`
  if (daysAgo >= 2 && daysAgo <= 6) {
    const weekday = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
    }).format(date)
    return `${calendarDate}, ${weekday}`
  }
  return calendarDate
}
