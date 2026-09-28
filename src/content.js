/*
 * Reading from the published set.
 *
 * Every served file is read from inside CONTENT_DIR and nowhere else, so
 * containment is a property of the constant rather than of what a caller passed
 * in.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const ROOT = join(here, "..");

/** The published security set. */
export const CONTENT_DIR = join(ROOT, "content");

/**
 * Reject anything that is not a plain relative path inside the set.
 *
 * This runs before any filesystem call, not after. A path that reaches `fs`
 * with a `..` in it has already been resolved against the process working
 * directory, and a check that runs afterwards is a check against a value the
 * caller already influenced.
 */
function isSafeRelativePath(input) {
  if (typeof input !== "string" || input.length === 0) return false;
  if (isAbsolute(input)) return false;
  if (input.includes("\0")) return false;
  if (input.includes("/") && input.includes("\\")) return false;

  return !input.split(/[/\\]/).some((segment) => segment === "..");
}

/**
 * Read one file from the published set.
 *
 * Paths are addressed relative to the set root, so a caller writes
 * `references/python-flask-web-server-security.md` or `SKILL.md`.
 *
 * Returns `null` for anything that is not a readable file inside the set. The
 * caller turns that into its own answer; this never throws for a bad path,
 * because a traversal attempt and a typo should be indistinguishable from
 * outside.
 */
export async function readSetFile(relativePath) {
  if (!isSafeRelativePath(relativePath)) return null;

  const target = resolve(CONTENT_DIR, relativePath);

  // Belt and braces. The segment check above is the real defence; this confirms
  // the resolved path is still inside the set, so a change to the check above
  // cannot silently widen what is reachable.
  const inside = relative(CONTENT_DIR, target);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) return null;
  if (inside.split(sep).includes("..")) return null;

  try {
    return await readFile(target, "utf8");
  } catch {
    return null;
  }
}
