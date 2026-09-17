import { forwardRef, useId, type SVGProps } from "react";

/**
 * Inline tesseract mark used anywhere the compact product glyph is required.
 * The export name remains stable for extension compatibility.
 */
export const OttoIcon = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(
  function OttoIcon(props, ref) {
    const id = useId().replaceAll(":", "");
    return (
      <svg ref={ref} viewBox="0 0 1024 1024" fill="none" aria-hidden="true" {...props}>
        <defs>
          <linearGradient id={`${id}-tl`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#ff303b" />
            <stop offset="1" stopColor="#760008" />
          </linearGradient>
          <linearGradient id={`${id}-tr`} x1="0" y1="1" x2="1" y2="0">
            <stop stopColor="#830008" />
            <stop offset="1" stopColor="#ff3340" />
          </linearGradient>
          <linearGradient id={`${id}-light`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#ff3540" />
            <stop offset="1" stopColor="#930009" />
          </linearGradient>
          <linearGradient id={`${id}-dark`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#b80012" />
            <stop offset="1" stopColor="#4a0004" />
          </linearGradient>
          <linearGradient id={`${id}-center`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#7a0008" />
            <stop offset="1" stopColor="#e92430" />
          </linearGradient>
        </defs>
        <g stroke="#870009" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M512 78 890 296 738 384 512 253Z" fill={`url(#${id}-tr)`} />
          <path d="M890 296v436l-152-88V384Z" fill={`url(#${id}-dark)`} />
          <path d="m890 732-378 218V774l226-130Z" fill={`url(#${id}-light)`} />
          <path d="M512 950 134 732l152-88 226 130Z" fill={`url(#${id}-tl)`} />
          <path d="M134 732V296l152 88v260Z" fill={`url(#${id}-light)`} />
          <path d="M134 296 512 78v175L286 384Z" fill={`url(#${id}-tl)`} />
          <path d="m512 365 154 89-154 89-154-89Z" fill={`url(#${id}-center)`} />
          <path d="m358 454 154 89v178l-154-89Z" fill={`url(#${id}-light)`} />
          <path d="m512 543 154-89v178l-154 89Z" fill={`url(#${id}-dark)`} />
        </g>
      </svg>
    );
  },
);
