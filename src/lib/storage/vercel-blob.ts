import { put, list } from "@vercel/blob";
import type { RiceScore } from "@/types";
import type { ScoreStore } from "./types";

function blobPath(org: string, projectId: string, issueId: string): string {
	return `scores/${encodeURIComponent(org)}/${encodeURIComponent(projectId)}/${encodeURIComponent(issueId)}.json`;
}

function projectPrefix(org: string, projectId: string): string {
	return `scores/${encodeURIComponent(org)}/${encodeURIComponent(projectId)}/`;
}

function getToken(): string | undefined {
	return process.env.BLOB_READ_WRITE_TOKEN;
}

async function fetchScore(downloadUrl: string): Promise<RiceScore | null> {
	try {
		const res = await fetch(downloadUrl, { cache: "no-store" });
		if (!res.ok) return null;
		return await res.json() as RiceScore;
	} catch {
		return null;
	}
}

export const vercelBlobStore: ScoreStore = {
	async getScores(org, projectId) {
		const token = getToken();
		const prefix = projectPrefix(org, projectId);
		const result: Record<string, RiceScore> = {};

		let cursor: string | undefined;
		do {
			const page = await list({ prefix, token, cursor });
			await Promise.all(
				page.blobs.map(async (blob) => {
					const score = await fetchScore(blob.downloadUrl);
					if (!score) return;
					const filename = blob.pathname.slice(prefix.length);
					const issueId = decodeURIComponent(filename.replace(/\.json$/, ""));
					result[issueId] = score;
				})
			);
			cursor = page.hasMore ? page.cursor : undefined;
		} while (cursor);

		return result;
	},

	async getScore(org, projectId, issueId) {
		const token = getToken();
		const path = blobPath(org, projectId, issueId);
		const { blobs } = await list({ prefix: path, token });

		const blob = blobs.find((b) => b.pathname === path);
		if (!blob) return null;

		return fetchScore(blob.downloadUrl);
	},

	async setScore(org, projectId, issueId, score) {
		const token = getToken();
		const path = blobPath(org, projectId, issueId);

		let existing: RiceScore = { reach: null, impact: null, confidence: null, effort: null };
		const { blobs } = await list({ prefix: path, token });
		const existingBlob = blobs.find((b) => b.pathname === path);
		if (existingBlob) {
			existing = (await fetchScore(existingBlob.downloadUrl)) ?? existing;
		}

		const merged: RiceScore = { ...existing, ...score };

		await put(path, JSON.stringify(merged), {
			access: "private",
			addRandomSuffix: false,
			allowOverwrite: true,
			token,
			contentType: "application/json",
		});

		return merged;
	},
};
