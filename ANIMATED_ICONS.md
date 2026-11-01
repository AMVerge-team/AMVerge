# Animated icons

Every icon in AMVerge now reacts to the control it sits on. This page is the
reviewer's map: what each one does on hover, what it does on a press, and how
to watch the whole set move before reading a line of code.

## See it move

```
cd frontend
npm run dev
```

Then open <http://localhost:1420/icon-gallery.html>. It lists every icon in a
real button, at the size the app draws it, with its clip names underneath.
Hover a tile, press it. The gallery is a dev page: it is not bundled into a
release build, and it needs no Tauri backend.

## How it works

The icons replace `react-icons` one for one. Each is exported under the name it
replaces (`FaCog`, `FaTrashAlt`, ...), so no call site changed - only the import
line. The default size stays `1em`, as react-icons had it, so existing CSS keeps
sizing them.

Three rules shape every clip.

**The icon listens to its button, not to itself.** A 14 px glyph covers about a
sixth of a 34 px button, so an icon watching its own pointer events would sit
still over most of the area people aim at. `useIconHost` walks up to the nearest
thing that is pressed. Half of AMVerge's controls are not `<button>` elements -
episode rows, dropdown items, video controls - so a computed `cursor: pointer`
counts as a host too. A disabled button fires no pointer events at all, so the
icon climbs one further to the wrapper, which is where the app puts its own
handlers for the same reason.

**Hover holds, a press returns.** A hover clip runs once and stays where it ends
until the pointer leaves. A press runs once and comes back on a timer - not on
`onAnimationComplete`, which sits on the parent `<svg>`, animates nothing, and
"finishes" immediately, cutting the children short.

**The gesture is the button's action, not the drawing.** A bin's lid opens, a
folder's flap swings, a slider's knob travels its rail. Where a control toggles,
the gesture previews the click: an open panel shows itself closing, a hidden one
shows itself opening. Nothing is ever a plain zoom of the whole mark.

What the glyphs may not do: no part leaves the 24 box, the drawing at rest is
identical to the Font Awesome / Feather / Lucide original it replaces, and any
node added for a clip is a real object the action involves, starting at
`opacity: 0`, never abstract decoration.

## The pack

84 icons from the NetsuIcon pack `amverge`, generated into
`frontend/src/components/icons/animated/`. Amplitudes in the table are the
distance the moving part actually covers on screen at 14 px, which is the size
most of them are drawn at.

| Icon | Component | Button it sits on | Hover | Press |
|---|---|---|---|---|
| `angle-right` | `FaAngleRightIcon` | — | **peek** · slides 2.9u (1.7 px) · 300 ms | **go** · slides 4.8u (2.8 px) · 560 ms |
| `apple` | `FaAppleIcon` | — | **tip** · swells ×1.05 (0.3 px) · 260 ms | **press** · swells ×1.05 (0.3 px) · 520 ms |
| `arrow-down` | `FaArrowDownIcon` | — | **peek** · slides 2.0u (1.2 px) · 280 ms | **go** · slides 2.0u (1.2 px) · 560 ms |
| `arrow-left` | `FaArrowLeftIcon` | — | **peek** · slides 2.0u (1.2 px) · 280 ms | **go** · slides 2.0u (1.2 px) · 560 ms |
| `arrow-up` | `FaArrowUpIcon` | — | **peek** · slides 2.0u (1.2 px) · 280 ms | **go** · slides 2.0u (1.2 px) · 560 ms |
| `arrows-alt-h` | `FaArrowsAltHIcon` | Flip horizontal | **pinch** · slides 0.6u (0.4 px) · 300 ms | **flip** · slides 0.6u (0.4 px) · 560 ms |
| `arrows-alt-v` | `FaArrowsAltVIcon` | Flip vertical | **pinch** · slides 0.6u (0.4 px) · 300 ms | **flip** · slides 0.6u (0.4 px) · 560 ms |
| `ban` | `FaBanIcon` | — | **no** · slides 1.1u (0.6 px) · 260 ms | **refuse** · slides 1.1u (0.6 px) · 520 ms |
| `bars` | `FaBarsIcon` | Menu | **part** · slides 2.9u (1.7 px) · 300 ms | **open** · slides 3.3u (1.9 px) · 640 ms |
| `bold` | `FaBoldIcon` | Bold | **weight** · strokeWidth (3.2 px) · 300 ms | **heavy** · strokeWidth (3.2 px) · 560 ms _(on)_ |
| `bolt` | `FaBoltIcon` | Settings: Features | **flicker** · swells ×1.05 (0.3 px) · 240 ms | **throw** · swells ×1.05 (0.3 px) · 520 ms |
| `bug` | `FaBugIcon` | Report a Bug / Issue | **notice** · slides 0.8u (0.4 px) · 300 ms | **spotted** · slides 0.8u (0.4 px) · 600 ms |
| `calendar-alt` | `FaCalendarAltIcon` | Community Events | **band** · slides 0.8u (0.4 px) · 320 ms | **raise-band** · slides 0.8u (0.4 px) · 700 ms |
| `calendar-plus` | `FaCalendarPlusIcon` | — | **band** · slides 0.8u (0.4 px) · 320 ms | **raise-band** · slides 0.8u (0.4 px) · 700 ms |
| `check-circle` | `FaCheckCircleIcon` | — | **lift** · swells ×1.05 (0.3 px) · 300 ms | **stamp** · swells ×1.05 (0.3 px) · 620 ms |
| `check` | `FaCheckIcon` | — | **trace** · draws (2.9 px) · 320 ms | **strike** · draws (2.9 px) · 600 ms |
| `chevron-down` | `FaChevronDownIcon` | — | **tip** · turns 15° (1.5 px) · 300 ms | **open** · turns 186° (18.0 px) · 620 ms _(on)_ |
| `chevron-left` | `FaChevronLeftIcon` | Previous month | **peek** · slides 2.9u (1.7 px) · 300 ms | **go** · slides 4.8u (2.8 px) · 540 ms |
| `chevron-right` | `FaChevronRightIcon` | Next month | **peek** · slides 2.9u (1.7 px) · 300 ms | **go** · slides 4.8u (2.8 px) · 540 ms |
| `chevron-up` | `FaChevronUpIcon` | — | **tip** · turns 15° (1.5 px) · 300 ms | **fold** · turns 186° (18.0 px) · 620 ms _(on)_ |
| `code-branch` | `FaCodeBranchIcon` | Settings: Discord Rich Presence | **lean** · turns 7° (0.7 px) · 300 ms | **branch** · turns 12° (1.2 px) · 620 ms |
| `cog` | `FaCogIcon` | Settings | **tooth** · turns 12° (1.3 px) · 320 ms | **turn** · turns 180° (19.7 px) · 700 ms |
| `columns` | `FaColumnsIcon` | Grid: Zoom In (Larger Tiles) | **peek** · slides 2.9u (1.7 px) · 300 ms | **collapse** · slides 5.0u (2.9 px) · 640 ms _(on)_ |
| `copy` | `FaCopyIcon` | Copy Logs | **peel** · slides 1.7u (1.0 px) · 320 ms | **duplicate** · slides 1.7u (1.0 px) · 700 ms |
| `database` | `FaDatabaseIcon`, `FiDatabaseIcon` | — | **lift** · slides 0.8u (0.4 px) · 300 ms | **seat** · slides 1.6u (0.9 px) · 700 ms |
| `desktop` | `FaDesktopIcon` | — | **tap** · slides 2.0u (1.2 px) · 260 ms | **knock** · slides 2.0u (1.2 px) · 560 ms |
| `discord` | `FaDiscordIcon` | Refresh events | **tick** · swells ×1.05 (0.3 px) · 220 ms | **press** · swells ×1.05 (0.3 px) · 460 ms |
| `edit` | `FaEditIcon` | — | **trace** · draws (0.4 px) · 320 ms | **write** · draws (0.4 px) · 700 ms |
| `ellipsis-h` | `FaEllipsisHIcon` | Choose icon | **roll** · slides 2.9u (1.7 px) · 320 ms | **open** · slides 4.8u (2.8 px) · 580 ms |
| `expand` | `FaExpandIcon` | Fullscreen | **out** · slides 2.9u (1.7 px) · 300 ms | **full** · slides 3.0u (1.8 px) · 620 ms _(on)_ |
| `external-link-alt` | `FaExternalLinkAltIcon` | — | **out** · swells ×1.13 (0.8 px) · 320 ms | **open** · swells ×1.18 (1.2 px) · 580 ms |
| `fi-database` | — | — | **lift** · slides 2.6u (1.5 px) · 300 ms | **seat** · slides 2.6u (1.5 px) · 720 ms |
| `fi-download` | — | Download this clip | **dip** · slides 2.9u (1.7 px) · 300 ms | **take** · swells ×2.00 (4.4 px) · 760 ms |
| `file-alt` | `FaFileAltIcon` | — | **tip** · turns 21° (2.1 px) · 320 ms | **knock** · turns 22° (2.1 px) · 620 ms |
| `file-export` | `FaFileExportIcon` | Settings: Export Profiles | **push** · swells ×1.05 (0.3 px) · 320 ms | **send** · swells ×1.18 (0.7 px) · 660 ms |
| `file-video` | `FaFileVideoIcon` | — | **tip** · turns 21° (2.2 px) · 320 ms | **knock** · turns 22° (2.2 px) · 620 ms |
| `folder-open` | `FaFolderOpenIcon` | Import New Episode | **ajar** · turns 8° (1.0 px) · 300 ms | **open** · turns 14° (1.6 px) · 700 ms |
| `folder-plus` | `FaFolderPlusIcon` | New folder | **lift** · slides 2.9u (1.7 px) · 300 ms | **pull** · slides 3.5u (2.0 px) · 680 ms |
| `folder` | `FaFolderIcon` | — | **lift** · slides 2.9u (1.7 px) · 300 ms | **show** · turns 11° (1.2 px) · 620 ms _(on)_ |
| `github` | `FaGithubIcon` | — | **tick** · swells ×1.05 (0.3 px) · 220 ms | **press** · swells ×1.05 (0.3 px) · 460 ms |
| `history` | `FaHistoryIcon` | Update Logs & Patch Notes | **wind** · turns 25° (1.2 px) · 320 ms | **rewind** · turns 360° (17.2 px) · 950 ms |
| `image` | `FaImageIcon` | — | **raise** · slides 2.9u (1.7 px) · 320 ms | **show** · slides 3.5u (2.0 px) · 700 ms |
| `info-circle` | `FaInfoCircleIcon` | About AMVerge | **dip** · slides 1.1u (0.6 px) · 300 ms | **press** · slides 1.1u (0.6 px) · 560 ms |
| `info` | `FaInfoIcon` | — | **tap** · slides 0.8u (0.4 px) · 320 ms | **say** · slides 0.8u (0.4 px) · 560 ms |
| `io-library` | — | Library | **rise** · slides 2.1u (1.2 px) · 320 ms | **pick** · slides 2.1u (1.2 px) · 760 ms |
| `keyboard` | `FaKeyboardIcon` | — | **tap** · slides 2.6u (1.5 px) · 260 ms | **type** · slides 3.6u (2.1 px) · 640 ms |
| `layer-group` | `FaLayerGroupIcon` | Scenepacks | **lift** · slides 0.8u (0.5 px) · 320 ms | **fan** · slides 0.8u (0.5 px) · 700 ms |
| `lu-file-search` | — | — | **peer** · slides 2.9u (1.7 px) · 300 ms | **scan** · slides 3.7u (2.1 px) · 680 ms |
| `md-keyboard-return` | — | — | **back** · slides 2.6u (1.5 px) · 300 ms | **enter** · slides 2.6u (1.5 px) · 600 ms |
| `microchip` | `FaMicrochipIcon` | — | **seat** · slides 2.1u (1.3 px) · 260 ms | **press-in** · slides 3.6u (2.1 px) · 560 ms |
| `minus` | `FaMinusIcon` | Fewer hours | **dip** · slides 2.1u (1.2 px) · 280 ms | **less** · slides 2.1u (1.2 px) · 540 ms |
| `paper-plane` | `FaPaperPlaneIcon` | — | **lift** · swells ×1.05 (0.3 px) · 320 ms | **send** · slides 0.6u (0.4 px) · 620 ms |
| `pause` | `FaPauseIcon` | — | **grip** · slides 2.1u (1.2 px) · 280 ms | **hold** · slides 2.1u (1.2 px) · 540 ms |
| `pencil-alt` | `FaPencilAltIcon` | Edit export settings | **press** · swells ×1.05 (0.3 px) · 280 ms | **bear-down** · swells ×1.05 (0.3 px) · 560 ms |
| `play` | `FaPlayIcon` | Resume processing | **lean** · slides 1.8u (1.0 px) · 300 ms | **go** · slides 1.8u (1.0 px) · 560 ms |
| `plus` | `FaPlusIcon` | More hours | **cock** · slides 2.1u (1.2 px) · 300 ms | **add** · slides 2.1u (1.2 px) · 560 ms |
| `redo` | `FaRedoIcon` | Rotate right | **step** · turns 10° (1.2 px) · 300 ms | **turn** · turns 360° (42.2 px) · 950 ms |
| `reg-calendar-alt` | `FaRegCalendarAltIcon` | — | **band** · slides 0.8u (0.4 px) · 320 ms | **raise-band** · slides 3.6u (2.1 px) · 700 ms |
| `search-plus` | `FaSearchPlusIcon` | Scene Scout: Search | **look** · turns 11° (1.2 px) · 280 ms | **hunt** · turns 16° (1.8 px) · 620 ms |
| `search` | `FaSearchIcon` | Search | **tilt** · turns 11° (1.2 px) · 300 ms | **sweep** · turns 16° (1.8 px) · 600 ms |
| `si-davinciresolve` | — | Send exported clips to DaVinci Resolve | **tick** · swells ×1.05 (0.3 px) · 240 ms | **press** · swells ×1.05 (0.3 px) · 500 ms |
| `sign-out-alt` | `FaSignOutAltIcon` | Sign out of Discord | **step** · slides 0.5u (0.3 px) · 320 ms | **leave** · slides 0.8u (0.5 px) · 600 ms |
| `sliders-h` | `FaSlidersHIcon` | Settings: Appearance | **touch** · slides 2.9u (1.7 px) · 300 ms | **set** · slides 4.8u (2.8 px) · 720 ms |
| `sort-alpha-down` | `FaSortAlphaDownIcon` | — | **dip** · slides 2.1u (1.2 px) · 300 ms | **sort** · slides 2.1u (1.2 px) · 600 ms |
| `sort-alpha-up` | `FaSortAlphaUpIcon` | — | **dip** · slides 2.1u (1.2 px) · 300 ms | **sort** · slides 2.1u (1.2 px) · 600 ms |
| `spinner` | `FaSpinnerIcon` | Import a database file | — | **turn** · turns 360° (40.3 px) · 1000 ms _(loop)_ |
| `sync-alt` | `FaSyncAltIcon` | Refresh episode | **step** · turns 11° (1.2 px) · 300 ms | **turn** · turns 360° (39.1 px) · 950 ms |
| `terminal` | `FaTerminalIcon` | Developer Console Logs | **prompt** · slides 0.7u (0.4 px) · 260 ms | **run** · slides 0.7u (0.4 px) · 660 ms |
| `th-large` | `FaThLargeIcon` | Select All Clips | **narrow** · slides 1.1u (0.6 px) · 280 ms | **take-all** · slides 1.1u (0.6 px) · 700 ms |
| `thumbtack` | `FaThumbtackIcon` | — | **nudge** · slides 0.7u (0.4 px) · 300 ms | **pin** · slides 0.7u (0.4 px) · 620 ms _(on)_ |
| `times` | `FaTimesIcon` | Clear Clip Selection | **twist** · turns 15° (1.2 px) · 280 ms | **close** · turns 25° (2.0 px) · 520 ms |
| `toolbox` | `FaToolboxIcon` | — | **lift** · slides 2.1u (1.2 px) · 300 ms | **open** · slides 2.1u (1.2 px) · 700 ms |
| `trash-alt` | `FaTrashAltIcon` | Remove from Scenepack | **peek** · slides 1.7u (1.0 px) · 300 ms | **empty** · slides 1.7u (1.0 px) · 720 ms |
| `trash` | `FaTrashIcon` | — | **peek** · slides 1.7u (1.0 px) · 300 ms | **empty** · slides 1.7u (1.0 px) · 720 ms |
| `undo` | `FaUndoIcon` | Rotate left | **step** · turns 10° (1.1 px) · 300 ms | **turn** · turns 360° (39.7 px) · 950 ms |
| `users` | `FaUsersIcon` | — | **nod** · slides 2.9u (1.7 px) · 300 ms | **answer** · slides 4.0u (2.4 px) · 660 ms |
| `video` | `FaVideoIcon` | — | **nod** · slides 2.9u (1.7 px) · 260 ms | **press** · slides 4.4u (2.6 px) · 540 ms |
| `volume-down` | `FaVolumeDownIcon` | — | **quieten** · slides 2.9u (1.7 px) · 300 ms | **mute** · slides 3.5u (2.0 px) · 560 ms |
| `volume-mute` | `FaVolumeMuteIcon` | — | **give** · slides 0.7u (0.4 px) · 300 ms | **unmute** · slides 0.8u (0.4 px) · 560 ms |
| `volume-up` | `FaVolumeUpIcon` | — | **quieten** · slides 0.8u (0.4 px) · 300 ms | **mute** · slides 2.7u (1.6 px) · 660 ms |
| `water` | `FaWaterIcon` | Scene Scout: Find clips that flow | **run** · slides 0.8u (0.4 px) · 320 ms | **carry** · slides 0.8u (0.4 px) · 720 ms |
| `windows` | `FaWindowsIcon` | — | **tick** · swells ×1.05 (0.3 px) · 240 ms | **press** · swells ×1.05 (0.3 px) · 500 ms |
| `wrench` | `FaWrenchIcon` | — | **nod** · swells ×1.05 (0.3 px) · 260 ms | **press** · swells ×1.05 (0.3 px) · 540 ms |
| `youtube` | `FaYoutubeIcon` | — | **tick** · swells ×1.05 (0.3 px) · 200 ms | **press** · swells ×1.05 (0.3 px) · 440 ms |

### Deliberately still

Six icons carry no clip. They are labels rather than controls - a warning
triangle in a modal, a heart in the credits, a trophy on a prize line - and an
icon with nothing to say about an action is better left alone than given a
movement that means nothing.

`comment-dots`, `exclamation-triangle`, `globe`, `heart`, `question-circle`,
`trophy`.

`question-circle` is the one to revisit: it sits on the "How to use" header,
which is a real control.

## The chrome set

These are not react-icons glyphs. AMVerge draws them by hand, so they never
went through the pack and had no animation at all until now. They live in
`frontend/src/components/icons/chrome/ChromeIcons.tsx` and follow the same
rules, with amplitudes set against the size each one actually renders at.

| Icon | Where | Hover | Press |
|---|---|---|---|
| `PanelLeftIcon` | Show / hide the episode or database panel | the divider runs to the wall the panel is heading for, and the filled strip follows it exactly - open shows itself closing, hidden shows itself opening (3.2 px, held) | the same, further, then back |
| `PanelRightIcon` | Show / hide the preview pane | mirror of the left one | mirror |
| `GridPreviewIcon` | Preview all clips | the four tiles lift one after the other, which is what the button starts (1.3 px, staggered) | the same wave, deeper |
| `WindowPinIcon` | Keep window on top | the pin tilts off its point (11°) | it tilts, then drives in |
| `WindowMinimizeIcon` | Minimize | the bar drops toward the floor of the box (1.4 px) | it winds up, then falls 3 px |
| `WindowMaximizeIcon` | Maximize / Restore | the frame swells to fill (×1.22); restored, the front pane slides back under | the same, with a dip first |
| `WindowCloseIcon` | Close | the cross twists 15° | it turns a full quarter, landing back on its own picture |
| `ZoomOutIcon` | Bigger tiles, fewer columns | the bar draws in on itself (×0.66) | further in, then back |
| `ZoomInIcon` | Smaller tiles, more columns | both arms reach out (×1.26) | further out, then back |
| `FolderAddIcon` | Add a video from your files | the plus lifts off the folder | it lifts, then drops in and shrinks |
| `DatabaseDownloadIcon` | Import a database file | the arrow arms back, then drives down | the same, deeper |

The Discord mark in the navbar now uses the pack's `FaDiscord`. Trademarks get
a pressure, never a scene: their shapes are not ours to deform.

## Known limits

**Twenty-odd clips move less than a pixel.** Their glyphs fill the 24 box to
within a unit on every side, so the part that should move has nowhere to go.
Making them visible means changing the gesture icon by icon, or accepting that
they are discreet. They are honest, just quiet.

**The two calendars are the worst of those** - `calendar-alt` on the Community
Events tab and `calendar-plus` on Host Event move 0.44 px. The only way out
within the rules is a prop: an event marker landing on the calendar face. That
adds an object to the drawing, so it is a decision, not a fix.

## Regenerating

The components are generated from the pack with `gen_components.py`, run with
no arguments - it rewrites `index.ts` from the icons it processed, so a partial
run breaks the build. Two Motion faults are corrected in that script and must
stay corrected:

- Motion owns `transform-origin`. It writes the property from its own
  `originX` / `originY`, which default to `50% 50%`, so a CSS
  `transformOrigin` is overwritten on the first render. Left alone, every
  pivot in the pack becomes the centre of the view box.
- Motion reads `x` and `y` as a translation, not as a rect's geometry - the
  attributes are `attrX` / `attrY`. A `<motion.rect x={5} y={16}>` draws at the
  origin and is then translated by whatever the clip animates. The rect stays
  plain; the motion goes on a `<g>` around it.
