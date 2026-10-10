import rawLogo from "../../../public/Scene_Scout_logo_full.svg?raw";

// the svg's teal family, lightest to darkest, mapped onto the theme accent so the logo follows it
const TEAL_TO_ACCENT: Record<string, string> = {
  "#7CF2EE": "var(--ss-logo-light)",
  "#78ECE7": "var(--ss-logo-light)",
  "#4BD1D4": "var(--ss-logo-base)",
  "#56B7B7": "var(--ss-logo-mid)",
  "#26A4A4": "var(--ss-logo-dark)",
  "#129B9B": "var(--ss-logo-deep)",
};

// built once: the traced svg ships a full-canvas white background and a lot of empty margin
const LOGO_MARKUP = (() => {
  let svg = rawLogo;
  // the first white path is the canvas background, not part of the logo
  svg = svg.replace(/<path fill="#FFFFFF"[^>]*>\s*<\/path>/i, "");
  // the remaining white fills are letter holes painted to match that background; let the page show through
  svg = svg.replace(/fill="#FFFFFF"/gi, 'fill="none"');
  // crop to the artwork and let css size it
  svg = svg.replace(/<svg([^>]*?)>/i, (_m, attrs: string) => {
    const cleaned = attrs
      .replace(/\s(width|height|x|y|enable-background)="[^"]*"/gi, "")
      .replace(/viewBox="[^"]*"/i, 'viewBox="40 300 1145 460"');
    return `<svg${cleaned} class="scene-scout-logo-svg" aria-hidden="true">`;
  });
  for (const [hex, color] of Object.entries(TEAL_TO_ACCENT)) {
    // attributes cannot take var(); an inline style can
    svg = svg.replace(new RegExp(`fill="${hex}"`, "gi"), `style="fill:${color}"`);
  }
  return svg;
})();

/** the full scene scout wordmark, recoloured to the current accent */
export function SceneScoutLogo({ className = "" }: { className?: string }) {
  return (
    <div
      className={`scene-scout-logo ${className}`.trim()}
      role="img"
      aria-label="Scene Scout"
      dangerouslySetInnerHTML={{ __html: LOGO_MARKUP }}
    />
  );
}

export default SceneScoutLogo;
