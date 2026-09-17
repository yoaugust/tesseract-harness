import tesseractLogo from "@/assets/tesseract-logo.png";

/**
 * Understated tesseract credit for the landing footer.
 */
export function PoweredByOmnigent() {
  return (
    <div
      className="group inline-flex select-none items-center gap-1 text-xs text-muted-foreground/45 transition-colors duration-300 ease-out hover:text-muted-foreground/75"
      data-testid="powered-by-omnigent"
    >
      <span>Powered by</span>
      <img
        src={tesseractLogo}
        alt=""
        aria-hidden="true"
        className="size-3.5 object-contain opacity-60 transition-opacity duration-300 ease-out group-hover:opacity-100"
      />
      <span>tesseract</span>
    </div>
  );
}
