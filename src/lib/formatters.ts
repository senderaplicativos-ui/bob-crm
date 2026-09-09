/**
 * Format a date string to Brasília timezone (America/Sao_Paulo)
 * Appends 'Z' if the string doesn't already end with a timezone indicator,
 * so the Date constructor treats it as UTC before converting.
 */
export function formatDateBR(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const iso = dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z";
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/**
 * Clean phone number: remove @lid, @g.us, etc. and format as (XX) XXXXX-XXXX
 */
export function formatPhone(raw: string): string {
  // Groups: show "GRUPO" instead of number
  if (raw.includes("@g.us") || raw.includes("@lid") || raw.includes("-")) {
    return "GRUPO";
  }

  // Remove everything after @
  let phone = raw.split("@")[0];
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 13 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    return `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return phone;
}
