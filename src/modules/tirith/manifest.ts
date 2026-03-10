// src/modules/tirith/manifest.ts
/**
 * @fileoverview Estate manifest loader for Tirith.
 * Reads and caches the YAML estate manifest describing Mithrandir's declared state.
 */

import * as fs from 'node:fs/promises';
import yaml from 'js-yaml';
import type { EstateManifest } from './types.js';

let cachedManifest: EstateManifest | null = null;
let cachedPath: string | null = null;
let cachedMtime: number | null = null;

/**
 * Load the estate manifest from a YAML file.
 * Caches in memory; reloads if the file's mtime has changed since last load.
 */
const DEFAULT_MANIFEST_PATH = new URL('../../../config/estate-manifest.yaml', import.meta.url).pathname;

export async function loadManifest(path: string = DEFAULT_MANIFEST_PATH): Promise<EstateManifest> {
  const stat = await fs.stat(path);
  const mtime = stat.mtimeMs;

  // Return cached if same file and not modified
  if (cachedManifest && cachedPath === path && cachedMtime === mtime) {
    return cachedManifest;
  }

  const content = await fs.readFile(path, 'utf-8');
  const parsed = yaml.load(content) as EstateManifest;

  // Basic validation
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid estate manifest at ${path}: expected object`);
  }
  if (!parsed.version || !parsed.host || !parsed.services) {
    throw new Error(`Invalid estate manifest at ${path}: missing required fields (version, host, services)`);
  }

  cachedManifest = parsed;
  cachedPath = path;
  cachedMtime = mtime;

  return parsed;
}

/**
 * Force-reload the manifest on next access (invalidate cache).
 */
export function invalidateManifestCache(): void {
  cachedManifest = null;
  cachedPath = null;
  cachedMtime = null;
}

/**
 * Get the currently cached manifest without reading from disk.
 * Returns null if no manifest has been loaded yet.
 */
export function getCachedManifest(): EstateManifest | null {
  return cachedManifest;
}
