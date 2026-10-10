function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

function truncateTitle(title: string, maxLength = 28): string {
  if (title.length <= maxLength) return title;
  return `${title.slice(0, maxLength - 3)}...`;
}

export function generateScoutPlaceholderSvg(title: string, timeframe: string): string {
  const safeTime = escapeXml(timeframe);
  const safeTitle = escapeXml(truncateTitle(title));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#18191c"/>
      <stop offset="100%" stop-color="#121316"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="2" y="2" width="316" height="176" rx="10" fill="none" stroke="#27272a" stroke-width="1.5"/>
  <g transform="translate(144, 46)">
    <rect x="0" y="0" width="32" height="24" rx="4" fill="#22c55e" opacity="0.15"/>
    <path d="M6 5 L10 5 L8 9 L4 9 Z" fill="#22c55e"/>
    <path d="M12 5 L16 5 L14 9 L10 9 Z" fill="#22c55e"/>
    <path d="M18 5 L22 5 L20 9 L16 9 Z" fill="#22c55e"/>
    <path d="M24 5 L28 5 L26 9 L22 9 Z" fill="#22c55e"/>
    <rect x="4" y="11" width="24" height="9" rx="2" fill="#22c55e" opacity="0.8"/>
  </g>
  <text x="160" y="112" text-anchor="middle" fill="#e4e4e7" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600">${safeTime}</text>
  <text x="160" y="134" text-anchor="middle" fill="#71717a" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="400">${safeTitle}</text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
