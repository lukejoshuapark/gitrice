import type { RiceScore } from "@/types";

/**
 * Computes the RICE score: (Reach × Impact × Confidence) / Effort
 * Returns null if any value is missing or Effort is zero.
 */
export function computeRiceScore(score: RiceScore): number | null {
	const { reach, impact, confidence, effort } = score;
	if (reach === null || impact === null || confidence === null || effort === null) {
		return null;
	}
	if (effort === 0) {
		return null;
	}
	const result = (reach * impact * confidence) / effort;
	return Math.round(result * 100) / 100;
}
