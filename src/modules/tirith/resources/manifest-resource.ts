import { loadManifest } from '../manifest.js';
import type { EstateManifest } from '../types.js';

interface ManifestResourceResult {
  timestamp: string;
  loaded: boolean;
  manifest: EstateManifest | null;
  error?: string;
}

export async function handleManifestResource(): Promise<ManifestResourceResult> {
  try {
    const manifest = await loadManifest();

    return {
      timestamp: new Date().toISOString(),
      loaded: true,
      manifest,
    };
  } catch (err) {
    return {
      timestamp: new Date().toISOString(),
      loaded: false,
      manifest: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
