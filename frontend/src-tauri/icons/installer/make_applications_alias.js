// usage: osascript -l JavaScript make_applications_alias.js <out path>
// finder alias to /Applications with its icon baked in; tahoe draws a dmg's /Applications symlink blank
ObjC.import("AppKit");

function run(argv) {
  const out = $.NSURL.fileURLWithPath(argv[0]);
  const target = $.NSURL.fileURLWithPath("/Applications");
  const err = Ref();
  const data = target.bookmarkDataWithOptionsIncludingResourceValuesForKeysRelativeToURLError(
    $.NSURLBookmarkCreationSuitableForBookmarkFile, $(), $(), err);
  if (data.isNil()) throw new Error("bookmark failed: " + err[0].localizedDescription.js);
  if (!$.NSURL.writeBookmarkDataToURLOptionsError(data, out, 0, err)) {
    throw new Error("alias write failed: " + err[0].localizedDescription.js);
  }
  const ws = $.NSWorkspace.sharedWorkspace;
  ws.setIconForFileOptions(ws.iconForFile("/Applications"), argv[0], 0);
}
