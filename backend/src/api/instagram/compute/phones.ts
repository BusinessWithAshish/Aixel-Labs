import { findPhoneNumbersInText, type CountryCode } from "libphonenumber-js";

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function uniqueValidPhones(
  matches: ReturnType<typeof findPhoneNumbersInText>,
): string[] {
  const seen = new Set<string>();
  const phones: string[] = [];

  for (const { number } of matches) {
    if (!number.isValid()) continue;
    const formatted = number.formatInternational();
    const key = phoneDigits(formatted);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    phones.push(formatted);
  }

  return phones;
}

function extractPhonesFromText(
  text: string | null | undefined,
  country: CountryCode,
): string[] {
  if (!text?.trim()) return [];

  try {
    return uniqueValidPhones(findPhoneNumbersInText(text, country));
  } catch {
    return [];
  }
}

export function collectBusinessPhoneNumbers(
  businessPhone: string | null | undefined,
  bio: string | null | undefined,
  country: CountryCode,
): string[] | null {
  if (businessPhone?.trim()) {
    return [businessPhone.trim()];
  }

  const phones = extractPhonesFromText(bio, country);
  return phones.length > 0 ? phones : null;
}
