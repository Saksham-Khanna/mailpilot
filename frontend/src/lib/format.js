const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateTime(value) {
  const parsed = parseDate(value);
  return parsed ? dateTimeFormatter.format(parsed) : "Unknown time";
}

export function formatShortDate(value) {
  const parsed = parseDate(value);
  return parsed ? shortDateFormatter.format(parsed) : "";
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
