import type { SVGProps } from "react";

export function AutoCodeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id="acSilverSheen" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#94A3B8" />
          <stop offset="50%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#CBD5E1" />
        </linearGradient>
        <linearGradient id="acSilverCrown" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="40%" stopColor="#E2E8F0" />
          <stop offset="70%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
      </defs>

      {/* Left Code Bracket */}
      <path
        d="M 38 48 C 30 54 30 58 24 64 C 30 70 30 74 38 80"
        stroke="url(#acSilverSheen)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Right Code Bracket */}
      <path
        d="M 90 48 C 98 54 98 58 104 64 C 98 70 98 74 90 80"
        stroke="url(#acSilverSheen)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* AC Monogram */}
      <text
        x="64"
        y="75"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontSize="34"
        fontWeight="900"
        letterSpacing="1"
        fill="currentColor"
      >
        AC
      </text>

      {/* Royal Silver Crown on Top-Left Corner */}
      <g transform="translate(16, 12) rotate(-15)">
        <path
          d="M 4 22 L 8 8 L 16 16 L 24 6 L 32 16 L 40 8 L 44 22 Z"
          fill="url(#acSilverCrown)"
          stroke="#FFFFFF"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M 2 22 C 14 26 34 26 46 22 L 45 25 C 33 29 15 29 3 25 Z" fill="#334155" />
        <circle cx="8" cy="8" r="2.2" fill="#FFFFFF" />
        <circle cx="24" cy="6" r="2.8" fill="#FFFFFF" />
        <circle cx="40" cy="8" r="2.2" fill="#FFFFFF" />
      </g>
    </svg>
  );
}
