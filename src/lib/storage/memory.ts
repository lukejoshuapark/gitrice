import type { RiceScore } from "@/types";
import type { ScoreStore } from "./types";

const store = new Map<string, RiceScore>();

function key(org: string, projectId: string, issueId: string): string {
	return `${org}|${projectId}|${issueId}`;
}

export const memoryStore: ScoreStore = {
	async getScores(org, projectId) {
		const prefix = `${org}|${projectId}|`;
		const result: Record<string, RiceScore> = {};
		for (const [k, v] of store.entries()) {
			if (k.startsWith(prefix)) {
				const issueId = k.slice(prefix.length);
				result[issueId] = v;
			}
		}
		return result;
	},

	async getScore(org, projectId, issueId) {
		return store.get(key(org, projectId, issueId)) ?? null;
	},

	async setScore(org, projectId, issueId, score) {
		const k = key(org, projectId, issueId);
		const existing = store.get(k) ?? { reach: null, impact: null, confidence: null, effort: null };
		const merged: RiceScore = { ...existing, ...score };
		store.set(k, merged);
		return merged;
	},
};
