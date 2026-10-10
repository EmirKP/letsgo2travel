// eslint-disable-next-line @typescript-eslint/no-require-imports -- Next's CommonJS plugin loads this adapter synchronously.
const { globSync: tinyGlobSync } = require("tinyglobby");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep the adapter compatible with the plugin's CommonJS loader.
const { isAbsolute } = require("node:path");

// Next 16.3.8 only uses this API for its rootDir setting. Unlike fast-glob,
// tinyglobby expands literal directories by default, so explicitly disable it.
exports.globSync = function globSync(pattern, options) {
  if (typeof pattern !== "string" || options?.onlyDirectories !== true || Object.keys(options).some((key) => key !== "onlyDirectories")) {
    throw new TypeError("Next ESLint glob adapter only supports globSync(string, { onlyDirectories: true }); review the adapter before changing its caller.");
  }
  const directories = tinyGlobSync(pattern, { cwd: process.cwd(), absolute: isAbsolute(pattern), onlyDirectories: true, expandDirectories: false });
  return directories.map((directory) => {
    if (pattern.endsWith("/")) return directory.endsWith("/") ? directory : `${directory}/`;
    return directory.length > 1 && !/^[a-z]:\/$/i.test(directory) ? directory.replace(/\/$/, "") : directory;
  });
};
