// Label words / placeholders that sometimes end up stored as an appointment value — the
// AI extractor copies a rate con's section HEADING ("Appointment", "TBD", "N/A") when
// the document states no actual time, and those got saved verbatim. They mean "no
// appointment", so they render (and re-save) as empty. Real free-text values
// ("FCFS", "07/06 0800-1700") pass through untouched.
const APPT_JUNK = new Set([
  "appointment", "appt", "appt time", "appointment time",
  "tbd", "tba", "n/a", "na", "none", "null", "-", "—",
]);

export function cleanAppt(raw?: string): string {
  const v = (raw ?? "").trim();
  return APPT_JUNK.has(v.toLowerCase().replace(/[.:]+$/, "")) ? "" : v;
}
