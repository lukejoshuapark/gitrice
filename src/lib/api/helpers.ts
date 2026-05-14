import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getGitHubClient } from "@/lib/github/client";
import { computeRiceScore } from "@/lib/rice";
import type { RiceScore } from "@/types";

type GitHubClient = ReturnType<typeof getGitHubClient>;

/**
 * Validates the session and returns the access token.
 * Returns a 401 NextResponse if the session is missing or unauthenticated.
 */
export async function requireAuth(): Promise<{ accessToken: string } | NextResponse> {
	const session = await auth();
	if (!session?.accessToken) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	return { accessToken: session.accessToken };
}

/**
 * Checks that the authenticated user is a member of the given org.
 * Returns a 403 NextResponse if they are not.
 */
export async function requireOrgMember(
	client: GitHubClient,
	org: string
): Promise<NextResponse | null> {
	if (!(await client.isOrgMember(org))) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	return null;
}

const RICE_FIELDS = ["reach", "impact", "confidence", "effort"] as const;

/**
 * Validates that all RICE score fields are numbers or null.
 * Returns a 400 NextResponse if any field is invalid, otherwise null.
 */
export function validateRiceScore(score: Partial<RiceScore>): NextResponse | null {
	for (const field of RICE_FIELDS) {
		const val = score[field];
		if (val !== undefined && val !== null && typeof val !== "number") {
			return NextResponse.json({ error: `Invalid value for ${field}` }, { status: 400 });
		}
	}
	return null;
}

/**
 * Optionally syncs a merged RICE score to the GitHub project custom field.
 * Non-fatal: GitHub errors are swallowed so local saves always succeed.
 */
export async function syncScoreToGitHub(
	client: GitHubClient,
	{
		projectId,
		projectItemId,
		fieldId,
		merged,
	}: {
		projectId: string;
		projectItemId: string;
		fieldId: string;
		merged: RiceScore;
	}
): Promise<void> {
	const computed = computeRiceScore(merged);
	if (computed !== null) {
		await client
			.updateProjectItemScore(projectId, projectItemId, fieldId, Math.round(computed))
			.catch(() => {});
	} else if (
		merged.reach === null &&
		merged.impact === null &&
		merged.confidence === null &&
		merged.effort === null
	) {
		await client.clearProjectItemScore(projectId, projectItemId, fieldId).catch(() => {});
	}
}

/**
 * Returns a standardized 500 error response from a caught exception.
 */
export function handleApiError(err: unknown): NextResponse {
	const message = err instanceof Error ? err.message : "Unknown error";
	return NextResponse.json({ error: message }, { status: 500 });
}
