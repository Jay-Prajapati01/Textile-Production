import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  title?: string;
}

// Project mark — a loom shuttle weaving through warp & weft threads.
// Self-contained black tile, so it reads on both dark and light themes.
export const Logo: React.FC<LogoProps> = ({ size = 40, className = '', title = 'Textile Loom OS' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    className={className}
    role="img"
    aria-label={title}
  >
    <title>{title}</title>
    <rect x="3" y="3" width="58" height="58" rx="15" fill="#101013" />
    <rect
      x="3"
      y="3"
      width="58"
      height="58"
      rx="15"
      fill="none"
      stroke="#FFFFFF"
      strokeOpacity="0.28"
      strokeWidth="2"
    />
    <g stroke="#FFFFFF" strokeLinecap="round">
      <line x1="21" y1="13" x2="21" y2="51" strokeWidth="3.5" />
      <line x1="29" y1="13" x2="29" y2="51" strokeWidth="3.5" strokeOpacity="0.45" />
      <line x1="37" y1="13" x2="37" y2="51" strokeWidth="3.5" strokeOpacity="0.45" />
      <line x1="45" y1="13" x2="45" y2="51" strokeWidth="3.5" />
    </g>
    <g stroke="#FFFFFF" strokeLinecap="round">
      <line x1="11" y1="25" x2="55" y2="25" strokeWidth="3" />
      <line x1="11" y1="41" x2="55" y2="41" strokeWidth="3" strokeOpacity="0.6" />
    </g>
    <path d="M33 20 L40 32 L33 44 L26 32 Z" fill="#FFFFFF" />
    <circle cx="33" cy="32" r="2.6" fill="#101013" />
  </svg>
);

export default Logo;
