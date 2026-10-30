import { EpisodeEntry, EpisodeFolder } from "../types/domain";
import { startTransition } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStateStore } from "../stores/appStore";
import { useEpisodePanelRuntimeStore, useEpisodePanelMetadataStore } from "../stores/episodeStore";
import { useGeneralSettingsStore } from "../stores/settingsStore";
import { useUIStateStore } from "../stores/UIStore";
import { stopRunningProcess } from "../features/processes/singleProcess";
import { dropFromReencodeQueue } from "../features/import/reencodeQueue";
/** opens an episode by id through getState, so small components can open one without subscribing */
export function openEpisodeById(episodeId: string) {
	const appState = useAppStateStore.getState();
	const episodeRuntimeState = useEpisodePanelRuntimeStore.getState();
	const episodeMetadataState = useEpisodePanelMetadataStore.getState();

	const selectedEpisode = episodeRuntimeState.episodes.find((e) => e.id === episodeId);
	if (!selectedEpisode) return;

	appState.setSelectedClips(new Set());
	appState.setFocusedClip(null);
	appState.setFocusedClipId(null);
	episodeRuntimeState.setSelectedEpisodeId(episodeId);
	episodeRuntimeState.setOpenedEpisodeId(episodeId);
	episodeRuntimeState.setSelectedFolderId(null);
	episodeMetadataState.setLastOpenedEpisodeId(episodeId);
	appState.setImportedVideoPath(selectedEpisode.videoPath);
	appState.setImportToken(Date.now().toString());

	// opening from Events would load it behind a page with no clips, so switch to home (like handleOpenScenepack)
	useUIStateStore.getState().setActivePage("home");

	startTransition(() => {
		appState.setClips(selectedEpisode.clips);
	});
}

export default function useEpisodePanelState() {
	// getState, not a subscription, which re-rendered the panel on every import tick
	const appState = useAppStateStore.getState();
	const episodeRuntimeState = useEpisodePanelRuntimeStore();
	const episodeMetadataState = useEpisodePanelMetadataStore();

	const handleSelectEpisode = (episodeId: string) => {
		episodeRuntimeState.setSelectedEpisodeId(episodeId);
		episodeRuntimeState.setSelectedFolderId(null);
	};

	const handleOpenEpisode = (episodeId: string) => {
		openEpisodeById(episodeId);
	};

	const handleSelectFolder = (folderId: string | null) => {
		episodeRuntimeState.setSelectedFolderId(folderId);
		episodeRuntimeState.setSelectedEpisodeId(null);
	};

	const handleMoveEpisodeToFolder = (episodeId: string, folderId: string | null) => {
		episodeRuntimeState.setEpisodes((prev) =>
			prev.map((e) => (e.id === episodeId ? { ...e, folderId } : e))
		);
	};

	const handleMoveEpisode = (
		episodeId: string,
		folderId: string | null,
		beforeEpisodeId?: string
	) => {
		episodeRuntimeState.setEpisodes((prev) => {
			const fromIndex = prev.findIndex((e) => e.id === episodeId);
			if (fromIndex === -1) return prev;

			const moving = { ...prev[fromIndex], folderId };
			const remaining = prev.filter((e) => e.id !== episodeId);

			if (!beforeEpisodeId) {
				return [moving, ...remaining];
			}

			const toIndex = remaining.findIndex((e) => e.id === beforeEpisodeId);
			if (toIndex === -1) {
				return [moving, ...remaining];
			}

			return [...remaining.slice(0, toIndex), moving, ...remaining.slice(toIndex)];
		});
	};

	const handleMoveFolder = (folderId: string, parentFolderId: string | null, beforeFolderId?: string) => {
		episodeMetadataState.setEpisodeFolders((prev) => {
			const byId = new Map(prev.map((f) => [f.id, f] as const));
			const moving = byId.get(folderId);
			if (!moving) return prev;

			// prevent cycles: cannot move a folder into itself or any of its descendants
			if (parentFolderId) {
				let cursor: string | null = parentFolderId;
				while (cursor) {
					if (cursor === folderId) return prev;
					const nextParent: string | null = byId.get(cursor)?.parentId ?? null;
					cursor = nextParent;
				}
			}

			const updatedMoving: EpisodeFolder = { ...moving, parentId: parentFolderId };
			const remaining = prev.filter((f) => f.id !== folderId);

			const indexOf = (id: string) => remaining.findIndex((f) => f.id === id);

			let insertIndex = -1;
			if (beforeFolderId) {
				insertIndex = indexOf(beforeFolderId);
			}

			if (insertIndex === -1) {
				if (parentFolderId === null) {
					insertIndex = remaining.findIndex((f) => (f.parentId ?? null) === null);
					if (insertIndex === -1) insertIndex = 0;
				} else {
					// insert at the start of the parent's children if present, else right after the parent
					insertIndex = remaining.findIndex((f) => (f.parentId ?? null) === parentFolderId);
					if (insertIndex === -1) {
						const parentIndex = indexOf(parentFolderId);
						insertIndex = parentIndex === -1 ? 0 : parentIndex + 1;
					}
				}
			}

			return [...remaining.slice(0, insertIndex), updatedMoving, ...remaining.slice(insertIndex)];
		});
	};

	const handleSortEpisodePanel = (direction: "asc" | "desc") => {
		const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
		const mult = direction === "asc" ? 1 : -1;

		const folders = episodeMetadataState.episodeFolders;
		const episodesSnapshot = episodeRuntimeState.episodes;

		const foldersByParent = new Map<string | null, EpisodeFolder[]>();
		for (const folder of folders) {
			const key = folder.parentId ?? null;
			const list = foldersByParent.get(key) ?? [];
			list.push(folder);
			foldersByParent.set(key, list);
		}

		for (const list of foldersByParent.values()) {
			list.sort((a, b) => mult * collator.compare(a.name, b.name));
		}

		const episodesByFolder = new Map<string | null, EpisodeEntry[]>();
		for (const ep of episodesSnapshot) {
			const key = ep.folderId;
			const list = episodesByFolder.get(key) ?? [];
			list.push(ep);
			episodesByFolder.set(key, list);
		}

		for (const list of episodesByFolder.values()) {
			list.sort((a, b) => mult * collator.compare(a.displayName, b.displayName));
		}

		const sortedFolders: EpisodeFolder[] = [];
		const visit = (folder: EpisodeFolder) => {
			sortedFolders.push(folder);
			const children = foldersByParent.get(folder.id) ?? [];
			for (const child of children) visit(child);
		};

		for (const root of foldersByParent.get(null) ?? []) visit(root);
		episodeMetadataState.setEpisodeFolders(sortedFolders);

		episodeRuntimeState.setEpisodes(() => {
			const result: EpisodeEntry[] = [];

			// root episodes (shown after folders in the UI)
			result.push(...(episodesByFolder.get(null) ?? []));

			// episodes for every folder in depth-first order
			for (const folder of sortedFolders) {
				result.push(...(episodesByFolder.get(folder.id) ?? []));
			}

			// any stray episodes with unknown folderId (shouldn't happen) keep at end
			for (const [key, list] of episodesByFolder) {
				if (key === null) continue;
				if (sortedFolders.some((f) => f.id === key)) continue;
				result.push(...list);
			}

			return result;
		});
	};

	const handleRenameEpisode = (episodeId: string, newName: string) => {
		const trimmed = (newName ?? "").trim();
		if (!trimmed) return;
		episodeRuntimeState.setEpisodes((prev) => prev.map((e) => (e.id === episodeId ? { ...e, displayName: trimmed } : e)));
	};

	const handleRenameFolder = (folderId: string, newName: string) => {
		const trimmed = (newName ?? "").trim();
		if (!trimmed) return;
		episodeMetadataState.setEpisodeFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f)));
	};

	const handleDeleteFolder = (folderId: string) => {
		episodeMetadataState.setEpisodeFolders((prev) =>
			prev
				.filter((f) => f.id !== folderId)
				.map((f) => (f.parentId === folderId ? { ...f, parentId: null } : f))
		);
		episodeRuntimeState.setEpisodes((prev) => prev.map((e) => (e.folderId === folderId ? { ...e, folderId: null } : e)));
		if (episodeRuntimeState.selectedFolderId === folderId) episodeRuntimeState.setSelectedFolderId(null);
	};

	const handleDeleteEpisode = async (episodeId: string) => {
		// a still-importing episode stops first so nothing writes into the folder deleted below
		if (useAppStateStore.getState().liveImportEpisodeIds.includes(episodeId)) {
			console.info("[episode] deleting an episode mid-import; stopping it first", { episodeId });
			await stopRunningProcess();
		}
		// a queued re-encode only drops this episode; the others carry on
		await dropFromReencodeQueue(episodeId);

		const wasOpenedEpisode = episodeRuntimeState.openedEpisodeId === episodeId;
		episodeRuntimeState.setEpisodes((prev) => prev.filter((e) => e.id !== episodeId));
		if (episodeRuntimeState.selectedEpisodeId === episodeId) episodeRuntimeState.setSelectedEpisodeId(null);
		if (episodeRuntimeState.openedEpisodeId === episodeId) episodeRuntimeState.setOpenedEpisodeId(null);
		if (episodeMetadataState.lastOpenedEpisodeId === episodeId) {
			episodeMetadataState.setLastOpenedEpisodeId(null);
		}
		// drop its persisted name and folder assignment too
		episodeMetadataState.removeEpisodeMetadata(episodeId);

		if (wasOpenedEpisode) {
			appState.setClips([]);
			appState.setSelectedClips(new Set());
			appState.setFocusedClip(null);
			appState.setFocusedClipId(null);
			appState.setImportedVideoPath(null);
		}

		// the id is the cache folder name; windows won't delete files still open, so a failed delete retries
		for (let attempt = 1; attempt <= 4; attempt++) {
			try {
				await invoke("delete_episode_cache", {
					episodeCacheId: episodeId,
					customPath: useGeneralSettingsStore.getState().episodesPath,
				});
				break;
			} catch (err) {
				if (attempt < 4) {
					await new Promise((resolve) => setTimeout(resolve, 400));
					continue;
				}
				// the entry is already gone; report the disk failure without restoring it
				console.error("[episode] failed to delete cache folder", { episodeId, err });
			}
		}
	};

	const handleCreateFolder = (name: string, parentFolderId: string | null) => {
		const trimmed = (name ?? "").trim();
		if (!trimmed) return;

		const folder: EpisodeFolder = {
			id: crypto.randomUUID(),
			name: trimmed,
			parentId: parentFolderId,
			isExpanded: true,
		};
		episodeMetadataState.setEpisodeFolders((prev) => [folder, ...prev]);
		episodeRuntimeState.setSelectedFolderId(folder.id);
	};

	const handleToggleFolderExpanded = (folderId: string) => {
		episodeMetadataState.setEpisodeFolders((prev) =>
			prev.map((f) => (f.id === folderId ? { ...f, isExpanded: !f.isExpanded } : f))
		);
	};

	return {
		handleSelectEpisode,
		handleOpenEpisode,
		handleSelectFolder,
		handleMoveEpisodeToFolder,
		handleMoveEpisode,
		handleMoveFolder,
		handleSortEpisodePanel,
		handleRenameEpisode,
		handleRenameFolder,
		handleDeleteFolder,
		handleDeleteEpisode,
		handleCreateFolder,
		handleToggleFolderExpanded,
	};
}