
// 🔍 Smart fuzzy matching + fallback
export function getProviderIcon(name: string) {
  const lower = name.toLowerCase();

  if (lower.includes("google")) return "logo-google";
  if (lower.includes("github")) return "logo-github";
  if (lower.includes("facebook")) return "logo-facebook";
  if (lower.includes("apple")) return "logo-apple";
  if (lower.includes("microsoft")) return "logo-windows";
  if (lower.includes("twitter") || lower.includes("x")) return "logo-twitter";
  if (lower.includes("discord")) return "logo-discord";
  if (lower.includes("slack")) return "logo-slack";
  if (lower.includes("dropbox")) return "logo-dropbox";
  if (lower.includes("amazon")) return "logo-amazon";
  if (lower.includes("notion")) return "book-outline";

  // ✳️ Fallback → first 2 letters
  const initials = name.trim().substring(0, 2).toUpperCase();
  return initials;
}
