export interface DetectedGit {
  isRepo: boolean;
  branch?: string;
  isDirty?: boolean;
  changedFileCount?: number;
  lastCommitSubject?: string;
}

export interface DetectedStack {
  /** e.g. "TypeScript", "JavaScript", "Dart", "Python", "PHP" — by file-extension prevalence. */
  languages: Array<{ language: string; fileCount: number }>;
  /** e.g. "npm", "yarn", "pnpm", "pip", "flutter pub", "composer" — from lockfiles/manifests present. */
  packageManagers: string[];
  /** e.g. "Next.js", "React", "NestJS", "Flutter", "Django", "Laravel" — from manifest dependencies. */
  frameworks: string[];
  /** Top-level dependency names pulled from manifests (package.json, pubspec.yaml, requirements.txt, composer.json). Capped. */
  dependencies: string[];
  /** Manifest/config files found at the workspace root or one level down. */
  configFiles: string[];
}

export interface DetectedCommands {
  test: string[];
  build: string[];
  lint: string[];
  /** Where a command came from, e.g. "package.json scripts.test" — kept for transparency, not shown to the model. */
  source: Record<string, string>;
}

export interface DirectoryStat {
  path: string;
  fileCount: number;
}

export interface WalkedFile {
  absPath: string;
  relPath: string;
}

export interface ProjectMap {
  workspaceRoot: string;
  stack: DetectedStack;
  commands: DetectedCommands;
  git: DetectedGit;
  entryPoints: string[];
  testDirectories: string[];
  importantDirectories: DirectoryStat[];
  totalFilesScanned: number;
  /** True if scanning stopped early because the tree was larger than SCAN_FILE_LIMIT. */
  truncated: boolean;
}
