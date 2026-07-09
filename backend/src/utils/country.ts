import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";

countries.registerLocale(enLocale);

/**
 * Resolves a free-form country input (full name like "India" / "United States",
 * or an ISO code) to an uppercase ISO 3166-1 alpha-2 code (e.g. "IN", "US").
 *
 * Both Evomi's `_country-XX` proxy selector and Google's `gl` param require the
 * alpha-2 code — passing a full name (e.g. `_country-india`) makes the proxy
 * reject the request with an empty response.
 */
export function toAlpha2CountryCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.length === 2 && countries.isValid(trimmed.toUpperCase())) {
    return trimmed.toUpperCase();
  }

  const alpha2 = countries.getAlpha2Code(trimmed, "en");
  if (alpha2) return alpha2.toUpperCase();

  if (trimmed.length === 3) {
    const fromAlpha3 = countries.alpha3ToAlpha2(trimmed.toUpperCase());
    if (fromAlpha3) return fromAlpha3.toUpperCase();
  }

  return null;
}
