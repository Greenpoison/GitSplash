#!/usr/bin/env node
// Bumps the patch version everywhere it's declared (package.json,
// package-lock.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml),
// tagged "-alpha", and prints the new version on its last stdout line. Run
// by .githooks/pre-commit on every commit — see that file for why. Stays on
// 0.x.y until told otherwise; nothing here ever bumps major/minor.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function bumpPatch(version) {
  const base = version.split("-")[0]; // drop any existing pre-release suffix (e.g. "-alpha")
  const parts = base.split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return `${parts.join(".")}-alpha`;
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

// Cargo itself only rewrites this on the next build, which otherwise leaves
// the lockfile's own version metadata one commit behind — same class of
// lag as the version-bump hook's original pre-push bug, just for a
// different file. Only touches the gitsplash package's own block, not any
// dependency that happens to be on the same version number.
const cargoLockPath = path.join(root, "src-tauri", "Cargo.lock");
if (fs.existsSync(cargoLockPath)) {
  const cargoLock = fs.readFileSync(cargoLockPath, "utf8");
  const updatedCargoLock = cargoLock.replace(
    /(\[\[package\]\]\nname = "gitsplash"\nversion = ").*(")/,
    `$1${newVersion}$2`,
  );
  fs.writeFileSync(cargoLockPath, updatedCargoLock);
}

console.log(newVersion);
