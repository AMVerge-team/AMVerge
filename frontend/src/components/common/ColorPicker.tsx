import { useState, useRef, useEffect } from "react";
import { HexColorPicker } from "react-colorful";
import Tooltip from "./Tooltip";
import { ACCENT_PRESET_COLORS } from "../../features/theme/colorPresets";

type ColorPickerProps = {
  color: string;
  onChange: (color: string) => void;
  /** swatches to offer; callers pass the list matching what they edit */
  presets?: string[];
};

export default function ColorPicker({
  color,
  onChange,
  presets = ACCENT_PRESET_COLORS,
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="color-picker-container" ref={containerRef}>
      <Tooltip content="Choose color">
        <div
          className="color-preview-box"
          style={{ backgroundColor: color }}
          onClick={() => setIsOpen(!isOpen)}
          role="button"
          aria-label="Choose color"
        />
      </Tooltip>
      
      {isOpen && (
        <div className="color-picker-popover">
          <div className="picker-section">
            <HexColorPicker color={color} onChange={onChange} />
          </div>

          <div className="presets-section">
            <label className="picker-label">Presets</label>
            <div className="color-presets-grid">
              {presets.map((preset) => (
                <Tooltip key={preset} content={preset} delay={250}>
                  <div
                    className={`color-preset-item ${color.toLowerCase() === preset.toLowerCase() ? "active" : ""}`}
                    style={{ backgroundColor: preset }}
                    onClick={() => onChange(preset)}
                    role="button"
                    aria-label={preset}
                  />
                </Tooltip>
              ))}
            </div>
          </div>
          
          <div className="manual-section">
            <div className="color-picker-manual">
              <span className="hex-prefix">#</span>
              <input
                type="text"
                className="hex-input"
                value={color.replace("#", "")}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^[0-9a-fA-F]{0,6}$/.test(val)) {
                    onChange(`#${val}`);
                  }
                }}
                spellCheck={false}
                maxLength={6}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
