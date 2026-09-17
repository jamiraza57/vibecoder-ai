import * as fs from "node:fs/promises";
import * as path from "node:path";
import { DetectedCommands, DetectedStack, WalkedFile } from "./types";

const EXTENSION_LANGUAGE: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".dart": "Dart",
  ".py": "Python",
  ".php": "PHP",
  ".rb": "Ruby",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".c": "C",
  ".cpp": "C++",
  ".cs": "C#",
};

const MAX_DEPENDENCIES = 25;

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function languageStats(files: WalkedFile[]): Array<{ language: string; fileCount: number }> {
  const counts = new Map<string, number>();
  for (const f of files) {
    const ext = path.extname(f.relPath).toLowerCase();
    const lang = EXTENSION_LANGUAGE[ext];
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([language, fileCount]) => ({ language, fileCount }))
    .sort((a, b) => b.fileCount - a.fileCount);
}

interface DetectionAccumulator {
  packageManagers: string[];
  frameworks: string[];
  dependencies: string[];
  configFiles: string[];
  commands: DetectedCommands;
}

export async function detectStackAndCommands(
  workspaceRoot: string,
  files: WalkedFile[]
): Promise<{ stack: DetectedStack; commands: DetectedCommands }> {
  const acc: DetectionAccumulator = {
    packageManagers: [],
    frameworks: [],
    dependencies: [],
    configFiles: [],
    commands: { test: [], build: [], lint: [], source: {} },
  };

  const addCommand = (kind: "test" | "build" | "lint", command: string, source: string) => {
    if (!acc.commands[kind].includes(command)) {
      acc.commands[kind].push(command);
      acc.commands.source[command] = source;
    }
  };

  // --- Node / JS ecosystem ---
  const pkgJsonPath = path.join(workspaceRoot, "package.json");
  const pkgJson = await readJsonIfExists(pkgJsonPath);
  if (pkgJson) {
    acc.configFiles.push("package.json");
    const deps = {
      ...(pkgJson.dependencies as Record<string, string> | undefined),
      ...(pkgJson.devDependencies as Record<string, string> | undefined),
    };
    acc.dependencies.push(...Object.keys(deps ?? {}));

    if (deps?.next) acc.frameworks.push("Next.js");
    if (deps?.react && !deps?.next) acc.frameworks.push("React");
    if (deps?.["@nestjs/core"]) acc.frameworks.push("NestJS");
    if (deps?.express) acc.frameworks.push("Express");
    if (deps?.vue) acc.frameworks.push("Vue");

    const scripts = (pkgJson.scripts as Record<string, string> | undefined) ?? {};
    if (scripts.test) addCommand("test", "npm test", "package.json scripts.test");
    if (scripts.build) addCommand("build", "npm run build", "package.json scripts.build");
    if (scripts.lint) addCommand("lint", "npm run lint", "package.json scripts.lint");

    if (await exists(path.join(workspaceRoot, "pnpm-lock.yaml"))) acc.packageManagers.push("pnpm");
    else if (await exists(path.join(workspaceRoot, "yarn.lock"))) acc.packageManagers.push("yarn");
    else acc.packageManagers.push("npm");
  }

  // --- Flutter / Dart ---
  const pubspecPath = path.join(workspaceRoot, "pubspec.yaml");
  if (await exists(pubspecPath)) {
    acc.configFiles.push("pubspec.yaml");
    acc.packageManagers.push("flutter pub");
    acc.frameworks.push("Flutter");
    addCommand("test", "flutter test", "pubspec.yaml present");
    addCommand("build", "flutter build", "pubspec.yaml present");
    addCommand("lint", "flutter analyze", "pubspec.yaml present");

    try {
      const raw = await fs.readFile(pubspecPath, "utf-8");
      const depSection = raw.split(/^dev_dependencies:/m)[0];
      const depMatches = [...depSection.matchAll(/^\s{2}([a-zA-Z0-9_]+):/gm)];
      acc.dependencies.push(...depMatches.map((m) => m[1]).filter((d) => d !== "flutter" && d !== "sdk"));
    } catch {
      // best-effort only
    }
  }

  // --- Python ---
  const requirementsPath = path.join(workspaceRoot, "requirements.txt");
  const pyprojectPath = path.join(workspaceRoot, "pyproject.toml");
  if (await exists(requirementsPath)) {
    acc.configFiles.push("requirements.txt");
    acc.packageManagers.push("pip");
    addCommand("test", "pytest", "requirements.txt present");
    try {
      const raw = await fs.readFile(requirementsPath, "utf-8");
      const names = raw
        .split("\n")
        .map((l) => l.split(/[=<>~! ]/)[0].trim())
        .filter(Boolean);
      acc.dependencies.push(...names);
      if (names.some((n) => n.toLowerCase() === "django")) acc.frameworks.push("Django");
      if (names.some((n) => n.toLowerCase() === "flask")) acc.frameworks.push("Flask");
    } catch {
      // best-effort only
    }
  } else if (await exists(pyprojectPath)) {
    acc.configFiles.push("pyproject.toml");
    acc.packageManagers.push("pip");
    addCommand("test", "pytest", "pyproject.toml present");
  }

  // --- PHP / Laravel ---
  const composerPath = path.join(workspaceRoot, "composer.json");
  const composerJson = await readJsonIfExists(composerPath);
  if (composerJson) {
    acc.configFiles.push("composer.json");
    acc.packageManagers.push("composer");
    const deps = composerJson.require as Record<string, string> | undefined;
    acc.dependencies.push(...Object.keys(deps ?? {}));
    if (deps?.["laravel/framework"]) acc.frameworks.push("Laravel");
    addCommand("test", "composer test", "composer.json present");
  }

  // --- Common config files worth surfacing regardless of ecosystem ---
  for (const candidate of ["Dockerfile", "docker-compose.yml", "tsconfig.json", ".env.example"]) {
    if (await exists(path.join(workspaceRoot, candidate))) acc.configFiles.push(candidate);
  }

  return {
    stack: {
      languages: languageStats(files),
      packageManagers: Array.from(new Set(acc.packageManagers)),
      frameworks: Array.from(new Set(acc.frameworks)),
      dependencies: Array.from(new Set(acc.dependencies)).slice(0, MAX_DEPENDENCIES),
      configFiles: Array.from(new Set(acc.configFiles)),
    },
    commands: acc.commands,
  };
}
