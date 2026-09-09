// Compute readable foreground color (black or white) for a given background hex.
// Uses WCAG relative luminance.

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return { r, g, b };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b };
  }
  return null;
}

function relLum({ r, g, b }: { r: number; g: number; b: number }) {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

/**
 * Returns a readable badge style: translucent background based on rule color
 * + a darker/lighter text color tuned to the active theme so contrast is good.
 */
export function getBadgeStyle(color: string): React.CSSProperties {
  const rgb = hexToRgb(color);
  if (!rgb) {
    return { backgroundColor: `${color}22`, color };
  }
  const lum = relLum(rgb);
  // For light backgrounds (yellow/cream) use very dark text; for dark colors use lighter accent.
  // We keep a translucent background of the brand color so the badge is still color-coded.
  const isLight = lum > 0.6;
  return {
    backgroundColor: `${color}22`,
    color: isLight ? "#1f2937" : color,
    border: `1px solid ${color}55`,
  };
}

/**
 * Returns pure black/white based on luminance — use when background is the
 * solid color (not translucent), e.g. status pills with full background.
 */
export function getReadableTextColor(color: string): string {
  const rgb = hexToRgb(color);
  if (!rgb) return "#ffffff";
  return relLum(rgb) > 0.5 ? "#0a0a0a" : "#ffffff";
}
