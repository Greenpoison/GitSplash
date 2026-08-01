#!/usr/bin/env node
// Builds the `latest.json` manifest the updater plugin's endpoint serves.
// Run after `npm run tauri build` (with TAURI_SIGNING_PRIVATE_KEY set, so the
// NSIS installer's `.sig` file exists), then upload the printed path's
// contents to the GitHub release alongside the installer and its `.sig`.
//
// Usage: node scripts/generate-update-manifest.cjs <notes...>
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;

const bundleDir = path.join(root, "src-tauri", "target", "release", "bundle", "nsis");
const setupFile = fs
  .readdirSync(bundleDir)
  .find((f) => f.endsWith("-setup.exe") && f.includes(version));
if (!setupFile) {
  console.error(
    `no *-setup.exe for version ${version} found in ${bundleDir} — run "npm run tauri build" first`,
  );
  process.exit(1);
}
const sigPath = path.join(bundleDir, `${setupFile}.sig`);
if (!fs.existsSync(sigPath)) {
  console.error(
    `${sigPath} is missing — the installer wasn't signed. Set TAURI_SIGNING_PRIVATE_KEY(_PATH) ` +
      "before running the build so createUpdaterArtifacts can produce a .sig file.",
  );
  process.exit(1);
}

const signature = fs.readFileSync(sigPath, "utf8").trim();
const notes = process.argv.slice(2).join(" ") || `GitSplash ${version}`;

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: `https://github.com/Greenpoison/GitSplash/releases/download/v${version}/${setupFile}`,
    },
  },
};

const outPath = path.join(bundleDir, "latest.json");
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(outPath);
