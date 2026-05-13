import type { ScoreStore } from "./types";
import { memoryStore } from "./memory";
import { azureStore } from "./azure";
import { vercelBlobStore } from "./vercel-blob";

/**
 * Returns the configured score store.
 *   - Azure Table Storage when AZURE_STORAGE_CONNECTION_STRING is set.
 *   - Vercel Blob Storage when BLOB_READ_WRITE_TOKEN is set.
 *   - In-memory fallback otherwise (useful for local dev/testing).
 */
export function getScoreStore(): ScoreStore {
	if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
		return azureStore;
	}
	if (process.env.BLOB_READ_WRITE_TOKEN) {
		return vercelBlobStore;
	}
	return memoryStore;
}

export type { ScoreStore };
