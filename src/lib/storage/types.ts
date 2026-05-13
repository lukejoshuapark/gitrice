import type { RiceScore } from "@/types";

export interface ScoreStore {
	/** Fetch all scores for every issue in a project. Keyed by issue node ID. */
	getScores(org: string, projectId: string): Promise<Record<string, RiceScore>>;
	/** Fetch the score for a single issue, or null if not yet saved. */
	getScore(org: string, projectId: string, issueId: string): Promise<RiceScore | null>;
	/** Upsert (merge) score fields for a single issue. Returns the merged score. */
	setScore(
		org: string,
		projectId: string,
		issueId: string,
		score: Partial<RiceScore>
	): Promise<RiceScore>;
}
