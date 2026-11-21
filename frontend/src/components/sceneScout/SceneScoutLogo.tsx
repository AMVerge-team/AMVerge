import rawLogo from "../../../public/Scene_Scout_logo_full.svg?raw";

// map both teal and orange families to accent-filled classes; inline style attributes are blocked by production csp
const COLOR_TO_ACCENT: Record<string, string> = {
  // teal family (SCOUT + squares)
  "#7CF2EE": "ss-logo-light",
  "#78ECE7": "ss-logo-light",
  "#4BD1D4": "ss-logo-base",
  "#56B7B7": "ss-logo-mid",
  "#26A4A4": "ss-logo-dark",
  "#129B9B": "ss-logo-deep",
  // orange family (SCENE + magnifying glass)
  "#FCC18A": "ss-logo-light",
  "#F7BA7D": "ss-logo-light",
  "#F5A656": "ss-logo-base",
  "#FD983F": "ss-logo-base",
  "#FA8F49": "ss-logo-base",
  "#FB8B39": "ss-logo-mid",
  "#FB8935": "ss-logo-mid",
  "#FB7B1E": "ss-logo-mid",
  "#F56E1B": "ss-logo-dark",
  "#FA6E07": "ss-logo-dark",
  "#FA6D05": "ss-logo-dark",
  "#F76610": "ss-logo-dark",
  "#F86306": "ss-logo-deep",
  "#F45908": "ss-logo-deep",
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
  for (const [hex, cls] of Object.entries(COLOR_TO_ACCENT)) {
    svg = svg.replace(new RegExp(`fill="${hex}"`, "gi"), `class="${cls}"`);
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
