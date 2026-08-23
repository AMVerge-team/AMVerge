# AMVerge -> DaVinci Resolve import.
#
# Placeholders are substituted by davinci_resolve.rs before the script is written
# to disk: __AMVERGE_MEDIA_JSON__ is a JSON array of absolute media paths (read
# as a raw string, so Windows backslashes survive), __AMVERGE_APPEND_JSON__ is a
# JSON boolean deciding whether the clips also land on a timeline.
#
# External scripting only answers on DaVinci Resolve Studio, with
# Preferences > System > General > External scripting using = Local.

import json
import os
import sys

MEDIA_FILES = json.loads(r'''__AMVERGE_MEDIA_JSON__''')
APPEND_TO_TIMELINE = json.loads(r'''__AMVERGE_APPEND_JSON__''')
TIMELINE_BASE_NAME = "AMVerge Import"


def prepare_dll_search_path():
    """fusionscript.dll pulls other DLLs from Resolve's install folder. Since
    Python 3.8 PATH no longer covers the dependencies of an extension loaded by
    absolute path, so the folder has to be registered explicitly -- without it
    the import dies with "initialization of fusionscript failed without raising
    an exception"."""
    if not hasattr(os, "add_dll_directory"):
        return
    lib = os.environ.get(
        "RESOLVE_SCRIPT_LIB",
        r"C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll",
    )
    folder = os.path.dirname(lib)
    if folder and os.path.isdir(folder):
        try:
            os.add_dll_directory(folder)
        except Exception:
            pass


def ensure_resolve_module():
    prepare_dll_search_path()
    try:
        import DaVinciResolveScript as dvr_script
        return dvr_script
    except Exception:
        pass

    candidates = []
    api_dir = os.environ.get("RESOLVE_SCRIPT_API")
    if api_dir:
        candidates.append(os.path.join(api_dir, "Modules"))
    if os.name == "nt":
        program_data = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
        candidates.append(os.path.join(
            program_data, "Blackmagic Design", "DaVinci Resolve",
            "Support", "Developer", "Scripting", "Modules",
        ))
    elif sys.platform == "darwin":
        candidates.append(
            "/Library/Application Support/Blackmagic Design/DaVinci Resolve"
            "/Developer/Scripting/Modules"
        )
    else:
        candidates.append("/opt/resolve/Developer/Scripting/Modules")

    for path in candidates:
        if os.path.isdir(path) and path not in sys.path:
            sys.path.append(path)

    import DaVinciResolveScript as dvr_script
    return dvr_script


def norm(p):
    return os.path.normcase(os.path.normpath(str(p or ""))).replace("\\", "/")


def iter_clips(folder):
    if not folder:
        return
    for clip in (folder.GetClipList() or []):
        yield clip
    for sub in (folder.GetSubFolderList() or []):
        for clip in iter_clips(sub):
            yield clip


def clips_by_path(media_pool):
    """Media Pool clips indexed by normalized file path, so an already-imported
    clip is reused instead of duplicated."""
    index = {}
    try:
        root = media_pool.GetRootFolder()
    except Exception:
        return index
    for clip in iter_clips(root):
        try:
            props = clip.GetClipProperty() or {}
            path = props.get("File Path") or props.get("FilePath") or ""
        except Exception:
            continue
        key = norm(path)
        if key and key not in index:
            index[key] = clip
    return index


def import_media(media_pool, paths):
    """ImportMedia is picky about its argument shape across Resolve versions:
    plain paths first, then clip-info dicts, then one file at a time so a single
    unreadable file cannot sink the whole batch. Returns the paths that failed."""
    if not paths:
        return []
    if media_pool.ImportMedia(paths):
        return []
    if media_pool.ImportMedia([{"FilePath": p} for p in paths]):
        return []
    failed = []
    for p in paths:
        if not media_pool.ImportMedia([p]):
            failed.append(p)
    return failed


def timeline_names(project):
    names = set()
    try:
        count = int(project.GetTimelineCount() or 0)
    except Exception:
        return names
    for i in range(1, count + 1):
        try:
            tl = project.GetTimelineByIndex(i)
            if tl:
                names.add(tl.GetName())
        except Exception:
            pass
    return names


def unique_timeline_name(project, base):
    """Resolve refuses duplicate timeline names, so the free name is picked
    BEFORE creating rather than by retrying blind."""
    taken = timeline_names(project)
    if base not in taken:
        return base
    for i in range(2, 1000):
        candidate = "%s (%d)" % (base, i)
        if candidate not in taken:
            return candidate
    return "%s (%d)" % (base, len(taken) + 2)


def clip_fps(item):
    try:
        return item.GetClipProperty("FPS")
    except Exception:
        return None


def ensure_timeline(project, media_pool, first_item):
    """Current timeline if there is one, otherwise a fresh timeline created at
    the clip's own frame rate -- setting timelineFrameRate BEFORE creation is
    what stops Resolve from reconforming the clips and drifting."""
    try:
        tl = project.GetCurrentTimeline()
    except Exception:
        tl = None
    if tl:
        return tl, False

    fps = clip_fps(first_item)
    if fps:
        try:
            project.SetSetting("timelineFrameRate", str(fps))
        except Exception:
            pass

    name = unique_timeline_name(project, TIMELINE_BASE_NAME)
    tl = media_pool.CreateEmptyTimeline(name)
    if not tl:
        raise RuntimeError("Resolve refused to create the timeline '%s'." % name)
    return tl, True


def append_items(media_pool, items):
    """AppendToTimeline fails SILENTLY (empty return, no exception) on VFR
    sources, degenerate durations or a frame-rate mismatch, so the per-item
    retry is what tells a total failure from a partial one. Returns the timeline
    items that were created."""
    appended = media_pool.AppendToTimeline(items)
    if appended:
        return list(appended) if isinstance(appended, list) else [appended]
    placed = []
    for item in items:
        one = media_pool.AppendToTimeline([item])
        if one:
            placed.extend(one if isinstance(one, list) else [one])
    return placed


def clear_markers(objects):
    """Chapters embedded in the exported files come back as markers on the
    imported clips, which is noise on the timeline. Only clips AMVerge itself
    just brought in are cleared, so markers the user placed on their own media
    are left alone."""
    for obj in objects:
        if not obj:
            continue
        try:
            obj.DeleteMarkersByColor("All")
        except Exception:
            pass


def main():
    dvr_script = ensure_resolve_module()
    resolve = dvr_script.scriptapp("Resolve")
    if not resolve:
        raise RuntimeError(
            "Could not connect to DaVinci Resolve. External scripting requires "
            "DaVinci Resolve Studio, running, with Preferences > System > "
            "General > External scripting using set to Local."
        )

    pm = resolve.GetProjectManager()
    project = pm.GetCurrentProject() if pm else None
    if not project:
        project = pm.CreateProject("AMVerge Auto Import") if pm else None
    if not project:
        raise RuntimeError(
            "No Resolve project is open, and AMVerge could not create one automatically."
        )

    media_pool = project.GetMediaPool()
    if not media_pool:
        raise RuntimeError("Could not access Resolve media pool.")

    wanted = []
    for p in MEDIA_FILES:
        ap = os.path.abspath(p)
        if ap not in wanted:
            wanted.append(ap)

    missing = [p for p in wanted if not os.path.exists(p)]
    if missing:
        raise RuntimeError("Resolve import paths not found: " + "; ".join(missing))

    known = clips_by_path(media_pool)
    to_import = [p for p in wanted if norm(p) not in known]
    failed = import_media(media_pool, to_import)
    if to_import and len(failed) == len(to_import):
        raise RuntimeError(
            "Resolve failed to import media into the current project. Failed paths: "
            + "; ".join(failed)
        )

    if not APPEND_TO_TIMELINE:
        print("Imported %d clip(s) into the DaVinci Resolve media pool."
              % (len(wanted) - len(failed)))
        return

    known = clips_by_path(media_pool)
    items = [known[norm(p)] for p in wanted if norm(p) in known]
    if not items:
        raise RuntimeError("None of the imported clips could be found back in the media pool.")

    imported_keys = {norm(p) for p in to_import}
    clear_markers([known[key] for key in imported_keys if key in known])

    timeline, created = ensure_timeline(project, media_pool, items[0])
    try:
        project.SetCurrentTimeline(timeline)
    except Exception:
        pass

    appended = append_items(media_pool, items)
    clear_markers(appended)
    placed = len(appended)
    try:
        timeline_name = timeline.GetName()
    except Exception:
        timeline_name = TIMELINE_BASE_NAME

    if not placed:
        sample = []
        for item in items[:3]:
            try:
                sample.append("%s@%s" % (item.GetName(), clip_fps(item)))
            except Exception:
                pass
        raise RuntimeError(
            "Resolve refused to append the clips to '%s' (clips=%d [%s]). Variable "
            "frame rate sources or a frame-rate mismatch are the usual cause."
            % (timeline_name, len(items), ", ".join(sample))
        )

    print("Sent %d clip(s) to the DaVinci Resolve timeline '%s'%s." % (
        placed, timeline_name, " (created)" if created else "",
    ))


main()
