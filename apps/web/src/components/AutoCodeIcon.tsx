import type { SVGProps } from "react";

export function AutoCodeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <clipPath id="botcodeSquircleClip">
          <rect x="0" y="0" width="512" height="512" rx="112" />
        </clipPath>
      </defs>
      <image width="512" height="512" href="/logo-512.webp" clipPath="url(#botcodeSquircleClip)" />
    </svg>
  );
}
