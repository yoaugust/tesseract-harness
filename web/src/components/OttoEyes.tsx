import { OttoIcon } from "@/components/icons/OttoIcon";

/** Static compatibility wrapper for the former animated mascot component. */
export function OttoEyes({ className }: { className?: string }) {
  return <OttoIcon className={className} role="img" aria-label="tesseract" aria-hidden={false} />;
}
