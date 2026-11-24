//! Fast read-only `rusqlite` queries for Scene Scout schema v4 databases.
//!
//! Avoids spawning Python CLI subprocesses on startup and sidebar refreshes (<1 ms
//! vs 300-1500 ms). Returns `None` for pre-v4 or unreadable files so callers fall
//! back seamlessly to `amverge scout ... --json`.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};

use super::types::{ScoutDatabase, ScoutVideo};

const DEFAULT_MODEL_VERSION: &str = "google/siglip2-so400m-patch16-naflex";
const SUPPORTED_SUFFIXES: &[&str] = &[".scoutdb", ".db", ".scdb", ".sqlite", ".sqlite3"];
const LISTED_SUFFIXES: &[&str] = &["scoutdb", "db", "scdb"];

fn sanitize_db_name(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut last_underscore = false;
    for ch in raw.trim().chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-') {
            out.push(ch);
            last_underscore = false;
        } else if !last_underscore {
            out.push('_');
            last_underscore = true;
        }
    }
    let trimmed = out.trim_matches(|c| matches!(c, '.' | '_' | '-'));
    let clipped: String = trimmed.chars().take(64).collect();
    if clipped.is_empty() {
        "database".to_string()
    } else {
        clipped
    }
}

fn looks_like_path(s: &str) -> bool {
    let low = s.to_lowercase();
    SUPPORTED_SUFFIXES.iter().any(|suf| low.ends_with(suf)) || s.contains('/') || s.contains('\\')
}

pub(super) fn resolve_db_path(raw: &str, root: &Path) -> PathBuf {
    let candidate = PathBuf::from(raw);
    if candidate.is_file() {
        return std::fs::canonicalize(&candidate).unwrap_or(candidate);
    }
    if looks_like_path(raw) {
        let mut p = candidate;
        let has_supported_ext = p
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| {
                let dotted = format!(".{}", e.to_lowercase());
                SUPPORTED_SUFFIXES.contains(&dotted.as_str())
            })
            .unwrap_or(false);
        if !has_supported_ext {
            p.set_extension("scoutdb");
        }
        return std::fs::canonicalize(&p).unwrap_or(p);
    }
    let filename = format!("{}.scoutdb", sanitize_db_name(raw));
    let joined = root.join(filename);
    std::fs::canonicalize(&joined).unwrap_or(joined)
}

fn strip_verbatim_prefix(p: PathBuf) -> String {
    let s = p.to_string_lossy().to_string();
    #[cfg(windows)]
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        return rest.to_string();
    }
    s
}

fn open_v4_ro(path: &Path) -> Option<Connection> {
    if !path.is_file() {
        return None;
    }
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .ok()?;
    let user_version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).ok()?;
    if user_version != 4 {
        return None;
    }
    let has_core: bool = conn
        .query_row(
            "SELECT COUNT(*) = 3 FROM sqlite_master WHERE type = 'table' AND name IN ('processed_videos', 'db_metadata', 'preprocessing_configs')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(false);
    if !has_core {
        return None;
    }
    Some(conn)
}

pub(super) fn try_read_database_info_v4(raw: &str, root: &str) -> Option<ScoutDatabase> {
    let resolved = resolve_db_path(raw, Path::new(root));
    read_database_info_file_v4(&resolved)
}

fn read_database_info_file_v4(path: &Path) -> Option<ScoutDatabase> {
    let conn = open_v4_ro(path)?;
    let size_bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("database")
        .to_string();

    let mut meta: HashMap<String, String> = HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT key, value FROM db_metadata") {
        if let Ok(rows) = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))) {
            for pair in rows.flatten() {
                meta.insert(pair.0, pair.1);
            }
        }
    }

    let mut media_roots: Vec<String> = Vec::new();
    if let Ok(mut stmt) = conn.prepare("SELECT root_path FROM media_roots ORDER BY root_path") {
        if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
            media_roots.extend(rows.flatten());
        }
    }

    let (video_count, scene_count): (u64, u64) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(scene_count), 0) FROM processed_videos",
            [],
            |r| {
                let vc: i64 = r.get(0)?;
                let sc: i64 = r.get(1)?;
                Ok((vc.max(0) as u64, sc.max(0) as u64))
            },
        )
        .ok()?;

    let model_version: String = conn
        .query_row(
            "SELECT pc.model_id FROM processed_videos pv JOIN preprocessing_configs pc ON pc.id = pv.config_id LIMIT 1",
            [],
            |r| r.get(0),
        )
        .or_else(|_| conn.query_row("SELECT model_id FROM preprocessing_configs LIMIT 1", [], |r| r.get(0)))
        .unwrap_or_else(|_| DEFAULT_MODEL_VERSION.to_string());

    let schema_version = meta
        .get("schema_version")
        .and_then(|v| v.parse::<u32>().ok())
        .or(Some(4));

    let clean_path = strip_verbatim_prefix(std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf()));

    Some(ScoutDatabase {
        name: stem,
        path: clean_path,
        video_count,
        scene_count,
        size_bytes,
        model_version,
        created_at: meta.remove("created_at"),
        database_id: meta.remove("database_id"),
        schema_version,
        created_by_app: meta.remove("created_by_app"),
        created_by_version: meta.remove("created_by_version"),
        updated_by_app: meta.remove("updated_by_app"),
        updated_by_version: meta.remove("updated_by_version"),
        updated_at: meta.remove("updated_at"),
        media_roots,
    })
}

pub(super) fn try_list_databases_v4(root: &str) -> Option<Vec<ScoutDatabase>> {
    let dir = Path::new(root);
    if !dir.is_dir() {
        return Some(Vec::new());
    }
    let entries = std::fs::read_dir(dir).ok()?;
    let mut paths: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| LISTED_SUFFIXES.contains(&ext.to_lowercase().as_str()))
                    .unwrap_or(false)
        })
        .collect();
    paths.sort();

    let mut seen = HashSet::new();
    let mut out = Vec::with_capacity(paths.len());
    for p in paths {
        let canon = std::fs::canonicalize(&p).unwrap_or_else(|_| p.clone());
        if !seen.insert(canon) {
            continue;
        }
        // If any database in root is pre-v4, return None so CLI handles mixed roots identically
        let info = read_database_info_file_v4(&p)?;
        out.push(info);
    }
    Some(out)
}

pub(super) fn try_read_videos_v4(raw: &str, root: &str) -> Option<Vec<ScoutVideo>> {
    let resolved = resolve_db_path(raw, Path::new(root));
    if !resolved.is_file() {
        return None;
    }
    let conn = open_v4_ro(&resolved)?;
    let mut stmt = conn
        .prepare(
            "SELECT v.id, v.filepath, v.status, v.modified_at, v.scene_count,
                    pc.model_id, pc.detector, pc.sampling_strategy, pc.sampling_config,
                    v.file_size, v.content_fingerprint, v.duration_ms, v.fps, v.width, v.height
             FROM processed_videos v
             LEFT JOIN preprocessing_configs pc ON pc.id = v.config_id
             ORDER BY v.id DESC",
        )
        .ok()?;

    let rows = stmt
        .query_map([], |r| {
            let filepath: String = r.get(1)?;
            let name = Path::new(&filepath)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or(&filepath)
                .to_string();
            let scene_count: i64 = r.get(4)?;
            let raw_cfg: Option<String> = r.get(8)?;
            let sampling_config = raw_cfg.and_then(|s| serde_json::from_str(&s).ok());
            let file_size: Option<i64> = r.get(9)?;
            let width: Option<i64> = r.get(13)?;
            let height: Option<i64> = r.get(14)?;

            Ok(ScoutVideo {
                id: r.get(0)?,
                filepath,
                name,
                scene_count: scene_count.max(0) as u64,
                status: r.get(2)?,
                modified_at: r.get(3)?,
                model_id: r.get(5)?,
                detector: r.get(6)?,
                sampling_strategy: r.get(7)?,
                sampling_config,
                file_size: file_size.and_then(|n| u64::try_from(n).ok()),
                content_fingerprint: r.get(10)?,
                duration_ms: r.get(11)?,
                fps: r.get(12)?,
                width: width.and_then(|n| u32::try_from(n).ok()),
                height: height.and_then(|n| u32::try_from(n).ok()),
            })
        })
        .ok()?;

    let mut videos = Vec::new();
    for v in rows {
        videos.push(v.ok()?);
    }
    Some(videos)
}

pub(super) fn try_read_videos_batch_v4(
    root: &str,
    databases: &[String],
) -> Option<HashMap<String, Vec<ScoutVideo>>> {
    let mut out = HashMap::with_capacity(databases.len());
    for raw in databases {
        let resolved = resolve_db_path(raw, Path::new(root));
        if !resolved.is_file() {
            out.insert(raw.clone(), Vec::new());
            continue;
        }
        let videos = try_read_videos_v4(raw, root)?;
        out.insert(raw.clone(), videos);
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_v4_fixture(path: &Path) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE db_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE media_roots (root_path TEXT PRIMARY KEY, added_at TEXT NOT NULL);
             CREATE TABLE preprocessing_configs (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 model_id TEXT NOT NULL,
                 detector TEXT NOT NULL,
                 sampling_strategy TEXT NOT NULL,
                 sampling_config TEXT NOT NULL
             );
             CREATE TABLE processed_videos (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 filepath TEXT UNIQUE NOT NULL,
                 modified_at REAL NOT NULL,
                 status TEXT NOT NULL,
                 scene_count INTEGER NOT NULL,
                 config_id INTEGER,
                 file_size INTEGER,
                 content_fingerprint TEXT,
                 duration_ms INTEGER,
                 fps REAL,
                 width INTEGER,
                 height INTEGER
             );
             INSERT INTO db_metadata VALUES ('database_id', '11111111-2222-3333-4444-555555555555');
             INSERT INTO db_metadata VALUES ('schema_version', '4');
             INSERT INTO db_metadata VALUES ('created_by_app', 'amverge');
             INSERT INTO db_metadata VALUES ('created_by_version', '2.0.5');
             INSERT INTO db_metadata VALUES ('created_at', '2026-11-24T00:00:00Z');
             INSERT INTO media_roots VALUES ('D:/Anime/Frieren', '2026-11-24T00:00:00Z');
             INSERT INTO preprocessing_configs VALUES (1, 'google/siglip2-so400m-patch16-naflex', 'precut', 'first_or_midpoint_v1', '{\"frames_per_scene\":1}');
             INSERT INTO processed_videos VALUES (1, 'D:/Anime/Frieren/ep01.mkv', 100.0, 'completed', 420, 1, 500000, 'blake2b_sample_v1:abcd', 1440000, 23.976, 1920, 1080);
             PRAGMA user_version = 4;",
        )
        .unwrap();
    }

    #[test]
    fn reads_v4_database_info_and_videos_natively() {
        let tmp = tempfile::tempdir().unwrap();
        let db = tmp.path().join("frieren.scoutdb");
        create_v4_fixture(&db);

        let root = tmp.path().to_string_lossy().to_string();
        let listed = try_list_databases_v4(&root).expect("v4 listing should succeed");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "frieren");
        assert_eq!(listed[0].video_count, 1);
        assert_eq!(listed[0].scene_count, 420);
        assert_eq!(listed[0].created_by_app.as_deref(), Some("amverge"));
        assert_eq!(listed[0].media_roots, vec!["D:/Anime/Frieren"]);

        let videos = try_read_videos_v4(db.to_str().unwrap(), &root).expect("v4 videos should succeed");
        assert_eq!(videos.len(), 1);
        assert_eq!(videos[0].name, "ep01.mkv");
        assert_eq!(videos[0].detector.as_deref(), Some("precut"));
        assert_eq!(videos[0].width, Some(1920));
    }

    #[test]
    fn returns_none_for_legacy_v3_database_so_cli_fallback_runs() {
        let tmp = tempfile::tempdir().unwrap();
        let db = tmp.path().join("old_v3.scoutdb");
        let conn = Connection::open(&db).unwrap();
        conn.execute_batch(
            "CREATE TABLE processed_videos (id INTEGER PRIMARY KEY, filepath TEXT UNIQUE);
             PRAGMA user_version = 3;",
        )
        .unwrap();
        drop(conn);

        let root = tmp.path().to_string_lossy().to_string();
        assert!(try_list_databases_v4(&root).is_none());
        assert!(try_read_videos_v4(db.to_str().unwrap(), &root).is_none());
    }
}
