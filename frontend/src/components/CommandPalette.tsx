import React, { useEffect, useState, useMemo, useRef } from "react";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { FaSearch, FaTimes, FaAngleRight, FaDiscord, FaGithub } from "react-icons/fa";
import { useUIStateStore } from "../stores/UIStore";
import { useEpisodePanelRuntimeStore, useEpisodePanelMetadataStore } from "../stores/episodeStore";
import { useScenepacksStore } from "../stores/scenepackStore";
import { useAppStateStore } from "../stores/appStore";
import { useGeneralSettingsStore, useThemeSettingsStore } from "../stores/settingsStore";
import { openEpisodeById } from "../hooks/useEpisodePanelState";
import useImportExport from "../hooks/useImportExport";
import { CATEGORY_CHIPS, CategoryFilter, PREFIX_FILTERS } from "./commandPalette/types";
import { buildCommands } from "./commandPalette/buildCommands";
import { CommandInspector } from "./commandPalette/CommandInspector";

const DISCORD_URL = "https://discord.gg/bmXjTgsAaN";
const GITHUB_URL = "https://github.com/AMVerge-team/AMVerge";
const FOCUS_DELAY_MS = 40;

// the palette must not open on top of these, since they own the keyboard
const BLOCKING_OVERLAYS =
  ".episode-modal-overlay, .crop-modal-overlay, .pxm-overlay, .startup-notification-overlay";

export default function CommandPalette() {
  const open = useUIStateStore((s: any) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUIStateStore((s: any) => s.setCommandPaletteOpen);
  const openMenu = useUIStateStore((s: any) => s.openMenu);
  const openSettings = useUIStateStore((s: any) => s.openSettings);
  const setActivePage = useUIStateStore((s: any) => s.setActivePage);
  const pinned = useUIStateStore((s: any) => s.pinned);
  const togglePinned = useUIStateStore((s: any) => s.togglePinned);
  const sidebarEnabled = useUIStateStore((s: any) => s.sidebarEnabled);
  const setSidebarEnabled = useUIStateStore((s: any) => s.setSidebarEnabled);
  const previewCollapsed = useUIStateStore((s: any) => s.previewCollapsed);
  const setPreviewCollapsed = useUIStateStore((s: any) => s.setPreviewCollapsed);
  const cols = useUIStateStore((s: any) => s.cols);
  const setCols = useUIStateStore((s: any) => s.setCols);

  const episodes = useEpisodePanelRuntimeStore((s) => s.episodes);
  const episodeNamesById = useEpisodePanelMetadataStore((s) => s.episodeNamesById);
  const scenepacks = useScenepacksStore((s) => s.scenepacks);
  const setSelectedScenepackId = useScenepacksStore((s) => s.setSelectedScenepackId);
  const setOpenedScenepackId = useScenepacksStore((s) => s.setOpenedScenepackId);

  const clips = useAppStateStore((s) => s.clips);
  const selectedClips = useAppStateStore((s) => s.selectedClips);
  const setSelectedClips = useAppStateStore((s) => s.setSelectedClips);

  const generalSettings = useGeneralSettingsStore();
  const themeSettings = useThemeSettingsStore();
  const { onImportClick } = useImportExport();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) return;
      e.preventDefault();
      const { commandPaletteOpen, settingsOpen, menuOpen } = useUIStateStore.getState() as any;
      if (settingsOpen || menuOpen || document.querySelector(BLOCKING_OVERLAYS)) return;
      setCommandPaletteOpen(!commandPaletteOpen);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setCommandPaletteOpen]);

  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    setActiveFilter("all");
    setSelectedIndex(0);
    setTimeout(() => inputRef.current?.focus(), FOCUS_DELAY_MS);
  }, [open]);

  const { effectiveFilter, cleanQuery } = useMemo(() => {
    const trimmed = searchQuery.trim();
    const prefixed = PREFIX_FILTERS[trimmed[0]];
    if (prefixed) return { effectiveFilter: prefixed, cleanQuery: trimmed.slice(1).trim() };
    return { effectiveFilter: activeFilter, cleanQuery: trimmed };
  }, [searchQuery, activeFilter]);

  const allCommands = useMemo(
    () =>
      buildCommands({
        episodes,
        episodeNamesById,
        scenepacks,
        clips,
        selectedClips,
        pinned,
        sidebarEnabled,
        previewCollapsed,
        cols,
        audioPlaybackHover: generalSettings.audioPlaybackHover,
        episodesPath: generalSettings.episodesPath,
        exportPath: generalSettings.exportPath,
        discordRPCEnabled: generalSettings.discordRPCEnabled,
        accentColor: themeSettings.accentColor,
        closePalette: () => setCommandPaletteOpen(false),
        openEpisode: openEpisodeById,
        setActivePage,
        setSelectedScenepackId,
        setOpenedScenepackId,
        setSelectedClips,
        setSidebarEnabled,
        setPreviewCollapsed,
        setCols,
        setAudioPlaybackHover: generalSettings.setAudioPlaybackHover,
        togglePinned,
        openMenu,
        openSettings,
        onImportClick,
      }),
    [
      episodes,
      episodeNamesById,
      scenepacks,
      clips,
      selectedClips,
      pinned,
      sidebarEnabled,
      previewCollapsed,
      cols,
      generalSettings,
      themeSettings,
      onImportClick,
      setSelectedScenepackId,
      setOpenedScenepackId,
      openMenu,
      openSettings,
      setActivePage,
      setSelectedClips,
      setCommandPaletteOpen,
      setSidebarEnabled,
      setPreviewCollapsed,
      setCols,
      togglePinned,
    ]
  );

  const filteredCommands = useMemo(() => {
    const lower = cleanQuery.toLowerCase();
    return allCommands.filter((cmd) => {
      if (effectiveFilter !== "all" && cmd.category !== effectiveFilter) return false;
      if (!lower) return true;
      return (
        cmd.title.toLowerCase().includes(lower) ||
        cmd.subtitle?.toLowerCase().includes(lower) ||
        cmd.badge?.toLowerCase().includes(lower)
      );
    });
  }, [allCommands, cleanQuery, effectiveFilter]);

  const activeCommand = filteredCommands[selectedIndex] || filteredCommands[0] || null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < filteredCommands.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredCommands.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      activeCommand?.action();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setCommandPaletteOpen(false);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const idx = CATEGORY_CHIPS.findIndex((c) => c.id === effectiveFilter);
      setActiveFilter(CATEGORY_CHIPS[(idx + 1) % CATEGORY_CHIPS.length].id);
      setSelectedIndex(0);
    }
  };

  useEffect(() => {
    resultsContainerRef.current
      ?.querySelector(".spotlight-pro-item.is-selected")
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div
      className="quick-menu-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setCommandPaletteOpen(false);
      }}
    >
      <div
        className="spotlight-pro-container"
        role="dialog"
        aria-modal="true"
        aria-label="Spotlight Command Center"
        onKeyDown={handleKeyDown}
      >
        <div className="spotlight-pro-header">
          <div className="spotlight-pro-searchbox">
            <FaSearch className="spotlight-pro-search-icon" />
            <input
              ref={inputRef}
              type="text"
              className="spotlight-pro-input"
              placeholder="Search episodes, scenepacks, actions, settings, menu..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIndex(0);
              }}
            />
            {searchQuery && (
              <button
                type="button"
                className="spotlight-pro-clear-btn"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedIndex(0);
                  inputRef.current?.focus();
                }}
              >
                <FaTimes />
              </button>
            )}
          </div>
          <button
            type="button"
            className="spotlight-pro-close-pill"
            onClick={() => setCommandPaletteOpen(false)}
          >
            ESC
          </button>
        </div>

        <div className="spotlight-pro-chips-bar">
          {CATEGORY_CHIPS.map((chip) => {
            const ChipIcon = chip.icon;
            return (
              <button
                key={chip.id}
                type="button"
                className={`spotlight-chip${effectiveFilter === chip.id ? " active" : ""}`}
                onClick={() => {
                  setActiveFilter(chip.id);
                  setSelectedIndex(0);
                  inputRef.current?.focus();
                }}
              >
                <ChipIcon className="chip-icon" />
                <span>{chip.label}</span>
                {chip.prefix && <span className="chip-prefix">{chip.prefix}</span>}
              </button>
            );
          })}
        </div>

        <div className="spotlight-pro-body">
          <div className="spotlight-pro-list-pane" ref={resultsContainerRef}>
            {filteredCommands.length === 0 ? (
              <div className="spotlight-pro-empty">
                <FaSearch className="empty-icon" />
                <h4>No matching results found</h4>
                <p>Try searching another title or use category filter chips above</p>
              </div>
            ) : (
              filteredCommands.map((cmd, idx) => {
                const Icon = cmd.icon;
                return (
                  <div
                    key={cmd.id}
                    className={`spotlight-pro-item${idx === selectedIndex ? " is-selected" : ""}`}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => cmd.action()}
                  >
                    <div className="spotlight-pro-item-icon">
                      <Icon />
                    </div>
                    <div className="spotlight-pro-item-main">
                      <div className="item-title-row">
                        <span className="item-title">{cmd.title}</span>
                        {cmd.badge && <span className="item-badge">{cmd.badge}</span>}
                      </div>
                      {cmd.subtitle && <span className="item-sub">{cmd.subtitle}</span>}
                    </div>
                    <FaAngleRight className="item-arrow" />
                  </div>
                );
              })
            )}
          </div>

          <div className="spotlight-pro-inspector-pane">
            <CommandInspector command={activeCommand} />
          </div>
        </div>

        <div className="spotlight-pro-footer">
          <div className="footer-keys">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> Navigate
            </span>
            <span>
              <kbd>↵</kbd> Open
            </span>
            <span>
              <kbd>TAB</kbd> Next Filter
            </span>
            <span>
              <kbd>ESC</kbd> Close
            </span>
          </div>

          <div className="footer-actions">
            <button
              type="button"
              className="spotlight-footer-btn discord"
              onClick={() => void openUrl(DISCORD_URL)}
            >
              <FaDiscord />
              <span>Discord</span>
            </button>
            <button
              type="button"
              className="spotlight-footer-btn github"
              onClick={() => void openUrl(GITHUB_URL)}
            >
              <FaGithub />
              <span>GitHub</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
