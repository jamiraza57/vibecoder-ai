import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as fssync from "node:fs";
import * as path from "node:path";
import { detectStackAndCommands } from "../src/context/detect";
import { walkWorkspace } from "../src/context/ignore";

function tmpWorkspace(): string {
  return fssync.mkdtempSync(path.join(os.tmpdir(), "vibecoder-detect-test-"));
}

test("detects a Next.js/React Node project from package.json", async () => {
  const root = tmpWorkspace();
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "app",
      dependencies: { next: "^14.0.0", react: "^18.0.0" },
      devDependencies: { typescript: "^5.0.0" },
      scripts: { test: "jest", build: "next build", lint: "eslint ." },
    })
  );
  await fs.writeFile(path.join(root, "yarn.lock"), "");
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(path.join(root, "src", "index.ts"), "export {}");

  const { files } = await walkWorkspace(root, [], { maxFiles: 1000 });
  const { stack, commands } = await detectStackAndCommands(root, files);

  assert.ok(stack.frameworks.includes("Next.js"));
  assert.ok(!stack.frameworks.includes("React"), "should not double-count React when Next.js is present");
  assert.ok(stack.packageManagers.includes("yarn"));
  assert.ok(stack.dependencies.includes("next"));
  assert.ok(stack.dependencies.includes("typescript"));
  assert.deepEqual(commands.test, ["npm test"]);
  assert.deepEqual(commands.build, ["npm run build"]);
  assert.deepEqual(commands.lint, ["npm run lint"]);
});

test("detects a Flutter project from pubspec.yaml", async () => {
  const root = tmpWorkspace();
  await fs.writeFile(
    path.join(root, "pubspec.yaml"),
    "name: my_app\ndependencies:\n  flutter:\n    sdk: flutter\n  get: ^4.6.5\n  dio: ^5.0.0\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n"
  );
  await fs.mkdir(path.join(root, "lib"));
  await fs.writeFile(path.join(root, "lib", "main.dart"), "void main() {}");

  const { files } = await walkWorkspace(root, [], { maxFiles: 1000 });
  const { stack, commands } = await detectStackAndCommands(root, files);

  assert.ok(stack.frameworks.includes("Flutter"));
  assert.ok(stack.packageManagers.includes("flutter pub"));
  assert.ok(stack.dependencies.includes("get"));
  assert.ok(stack.dependencies.includes("dio"));
  assert.ok(commands.test.includes("flutter test"));
  assert.ok(commands.lint.includes("flutter analyze"));
});

test("detects a Laravel project from composer.json", async () => {
  const root = tmpWorkspace();
  await fs.writeFile(
    path.join(root, "composer.json"),
    JSON.stringify({ require: { "laravel/framework": "^10.0", "php": "^8.1" } })
  );

  const { files } = await walkWorkspace(root, [], { maxFiles: 1000 });
  const { stack } = await detectStackAndCommands(root, files);

  assert.ok(stack.frameworks.includes("Laravel"));
  assert.ok(stack.packageManagers.includes("composer"));
});

test("an empty directory detects no frameworks or package managers", async () => {
  const root = tmpWorkspace();
  const { files } = await walkWorkspace(root, [], { maxFiles: 1000 });
  const { stack, commands } = await detectStackAndCommands(root, files);

  assert.deepEqual(stack.frameworks, []);
  assert.deepEqual(stack.packageManagers, []);
  assert.deepEqual(commands.test, []);
});
