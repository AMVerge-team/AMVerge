# Releasing AMVerge 2

Every V1 install polls `https://github.com/crptk/AMVerge/releases/latest/download/latest.json`. Whatever release is marked **latest** there is what V1 installs, so a V2 release going live migrates every V1 user at once.

That's why `release-multi-platform.yml` on this branch always publishes as a **pre-release**. Going live is a manual step.

## Order
1. Ship **V1 1.3.3** (`AMVerge_MAIN`, `main`, tag `v1.3.3`). It exports settings and episodes for V2 on every launch and after every library change, and replaces the plain update dialog with the AMVerge 2 modal.
2. Wait a few weeks for 1.3.3 to spread. Users still on 1.3.2 when V2 goes live get their episodes rebuilt from V1's default episodes folder (clips only: no scene times, source video or settings).
3. Don't release any more V1 versions. Each one becomes "latest" and hides V2 from V1 users.
4. Tag `v2.0.0` and let the workflow run. The release comes out as a pre-release. Install it from the release page once as a smoke test.
5. Promote it: **Actions › Release Multi Platform › Run workflow** on the `v2.0.0` tag with **promote_to_latest** ticked. Or tick "Set as the latest release" on GitHub.

Tags with a suffix (`v2.0.0-rc1`) are never promoted. Later V2 patches (2.0.1, ...) need the same promote step.

## After going live
- On the launch after the import, V2 deletes V1's `%APPDATA%` and `%LOCALAPPDATA%` `com.amiri.amverge` folders, but only if V1's `episodes\` folder has nothing left in it. If an episode failed to move, both folders stay, so it's still in `%APPDATA%\com.amiri.amverge\episodes\`. Moved episodes are in V2's `episodes_storage\`, and a V1 custom episodes folder is never touched.
- `%APPDATA%\app.amverge\v1-imported` marks the import done; deleting it re-runs the import on the next launch.
