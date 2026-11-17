# sidebar

The `sidebar` module handles top-level page navigation and organizes imported episodes, folders, and scenepacks.

---

## Structure

```text
sidebar/
├── Sidebar.tsx                 # Sidebar container, nav tabs, and active library panel
├── SidebarNav.tsx              # Navigation links (Home, Scene Scout, Scenepacks, Events, Menu, Settings)
├── types.ts                    # Shared sidebar prop and drag/drop types
│
├── episodePanel/               # Imported episodes & nested folder tree
│   ├── EpisodePanel.tsx
│   ├── EpisodePanelHeader.tsx  # Sort, New Folder, Clear Cache actions
│   ├── EpisodePanelTree.tsx    # Recursive folder/episode renderer
│   ├── EpisodeRow.tsx
│   ├── FolderRow.tsx
│   ├── EpisodePanelModals.tsx
│   └── EpisodePanelContextMenus.tsx
│
├── scenepacks/                 # Custom curated clip collections
│   ├── ScenepacksPanel.tsx
│   ├── ScenepackModals.tsx
│   ├── ScenepackContextMenus.tsx
│   ├── ScenepackThumbnailModal.tsx
│   ├── useScenepackStructure.ts
│   └── usePackDrag.ts
│
└── hooks/                      # Episode panel derived state & interactions
    ├── useEpisodePanelStructure.ts
    ├── useEpisodePanelMenus.ts
    └── useEpisodePanelDragDrop.ts
```

---

## Responsibilities

- **Navigation (`SidebarNav.tsx`):** Switches between `Home`, `Scene Scout`, `Scenepacks`, `Events`, `Menu`, and `Settings`.
- **Episode organization (`episodePanel/` + `hooks/`):** Manages nested folders, multi-select (`Delete`, `F2` rename), drag-and-drop reordering, sort order, and per-episode cache cleanup. UI components stay presentational while tree indexing, context menu state, and pointer drag/drop live in the hooks under `hooks/`.
- **Scenepacks (`scenepacks/`):** Manages custom clip collections, thumbnails, and pack reordering alongside the episode tree.
