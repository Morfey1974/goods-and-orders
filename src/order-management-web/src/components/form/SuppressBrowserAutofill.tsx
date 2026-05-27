/** Hidden decoy fields — reduces Chrome address/password save prompts on business forms. */
export function SuppressBrowserAutofill() {
  return (
    <>
      <input
        type="text"
        name="browser-autofill-decoy"
        autoComplete="off"
        tabIndex={-1}
        aria-hidden
        className="autofill-decoy"
        defaultValue=""
      />
      <input
        type="password"
        name="browser-autofill-decoy-pass"
        autoComplete="new-password"
        tabIndex={-1}
        aria-hidden
        className="autofill-decoy"
        defaultValue=""
      />
    </>
  );
}
