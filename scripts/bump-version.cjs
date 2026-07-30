#!/usr/bin/env node
// Bumps the patch version everywhere it's declared (package.json,
// package-lock.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml) and
// prints the new version on its last stdout line. Run by .githooks/pre-push
// on every `git push` — see that file for why. Stays on 0.x.y until told
// otherwise; nothing here ever bumps major/minor.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function bumpPatch(version) {
  const parts = version.split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.join(".");
}

const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const newVersion = bumpPatch(pkg.version);
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const lockPath = path.join(root, "package-lock.json");
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  lock.version = newVersion;
  if (lock.packages && lock.packages[""]) {
    lock.packages[""].version = newVersion;
  }
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
}

const tauriConfPath = path.join(root, "src-tauri", "tauri.conf.json");
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
tauriConf.version = newVersion;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");

const cargoTomlPath = path.join(root, "src-tauri", "Cargo.toml");
const cargoToml = fs.readFileSync(cargoTomlPath, "utf8");
const updatedCargoToml = cargoToml.replace(/^version = ".*"$/m, `version = "${newVersion}"`);
fs.writeFileSync(cargoTomlPath, updatedCargoToml);

console.log(newVersion);
