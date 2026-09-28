import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_JSON = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "package.json"
);

let resolved = "0.0.0";
try {
  resolved = JSON.parse(await readFile(PACKAGE_JSON, "utf8")).version ?? resolved;
} catch {
  // Keep the bundled server usable if package.json cannot be read.
}

export const version = resolved;
