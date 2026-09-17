import * as path from "node:path";
import { DirectoryStat, WalkedFile } from "./types";

const TOP_DIRECTORY_COUNT = 8;

const TEST_DIR_NAMES = new Set(["test", "tests", "__tests__", "spec", "specs", "integration_test"]);
const ENTRY_POINT_CANDIDATES = [
  "src/index.ts",
  "src/index.js",
  "src/main.ts",
  "index.ts",
  "index.js",
  "lib/main.dart",
  "main.py",
  "manage.py",
  "public/index.php",
  "app.js",
  "server.js",
];

/** Top-level (depth-1) directories ranked by how many files live under them. */
export function computeImportantDirectories(files: WalkedFile[]): DirectoryStat[] {
  const counts = new Map<string, number>();
  for (const f of files) {
    const parts = f.relPath.split(path.sep);
    if (parts.length < 2) continue; // root-level file, not inside a directory
    const topDir = parts[0];
    counts.set(topDir, (counts.get(topDir) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([dirPath, fileCount]) => ({ path: dirPath, fileCount }))
    .sort((a, b) => b.fileCount - a.fileCount)
    .slice(0, TOP_DIRECTORY_COUNT);
}

export function findTestDirectories(files: WalkedFile[]): string[] {
  const found = new Set<string>();
  for (const f of files) {
    const parts = f.relPath.split(path.sep);
    for (let i = 0; i < parts.length - 1; i++) {
      if (TEST_DIR_NAMES.has(parts[i].toLowerCase())) {
        found.add(parts.slice(0, i + 1).join("/"));
      }
    }
  }
  return Array.from(found).sort();
}

export function findEntryPoints(files: WalkedFile[]): string[] {
  const present = new Set(files.map((f) => f.relPath.split(path.sep).join("/")));
  return ENTRY_POINT_CANDIDATES.filter((candidate) => present.has(candidate));
}
