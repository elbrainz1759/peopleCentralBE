/**
 * Calculates total working hours between two dates (inclusive).
 * Mon–Thu = 9 hours, Fri = 4 hours, Sat–Sun = 0 hours.
 */
export function calculateHoursForRange(
  startDate: string,
  endDate: string,
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Normalize to midnight to avoid time zone drift
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (end < start) return 0;

  let totalHours = 0;
  const current = new Date(start);

  while (current <= end) {
    const day = current.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    if (day >= 1 && day <= 4) {
      totalHours += 9; // Mon–Thu
    } else if (day === 5) {
      totalHours += 4; // Fri
    }
    // Sat (6) and Sun (0) = 0 hours
    current.setDate(current.getDate() + 1);
  }

  return totalHours;
}

/**
 * Calculates total hours across multiple date ranges.
 */
export function calculateTotalHours(
  durations: { startDate: string; endDate: string }[],
): number {
  return durations.reduce(
    (sum, d) => sum + calculateHoursForRange(d.startDate, d.endDate),
    0,
  );
}

/**
 * Checks if two date ranges overlap.
 */
export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Validates that no two ranges within the same request overlap each other.
 * Returns the conflicting pair or null if clean.
 */
export function findInternalOverlap(
  durations: { startDate: string; endDate: string }[],
): { a: number; b: number } | null {
  for (let i = 0; i < durations.length; i++) {
    for (let j = i + 1; j < durations.length; j++) {
      if (
        rangesOverlap(
          durations[i].startDate,
          durations[i].endDate,
          durations[j].startDate,
          durations[j].endDate,
        )
      ) {
        return { a: i, b: j };
      }
    }
  }
  return null;
}
