/** Tokens that discourage Chrome “Save address?” on CRM / settings forms. */
export const FORM_AUTOCOMPLETE_OFF = 'off' as const;

/** Scoped token — keeps fields out of personal-address heuristics. */
export function formAutocompleteSection(section: string) {
  return `section-${section} off`;
}
