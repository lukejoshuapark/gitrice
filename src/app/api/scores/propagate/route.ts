import { NextRequest, NextResponse } from "next/server";
import { getScoreStore } from "@/lib/storage";
import { getGitHubClient } from "@/lib/github/client";
import { computeRiceScore } from "@/lib/rice";
import {
	requireAuth,
	requireOrgMember,
	validateRiceScore,
	handleApiError,
} from "@/lib/api/helpers";
import type { RiceScore } from "@/types";

export async function POST(request: NextRequest) {
	const auth = await requireAuth();
	if (auth instanceof NextResponse) return auth;

	let body: { org: string; projectId: string; score: RiceScore; items: { issueId: string; itemId: string }[]; fieldId?: string };
	try {
		body = await request.json() as typeof body;
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const { org, projectId, score, items, fieldId } = body;

	if (!org || !projectId || !score || !Array.isArray(items) || items.length === 0) {
		return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
	}

	const client = getGitHubClient(auth.accessToken);
	const forbidden = await requireOrgMember(client, org);
	if (forbidden) return forbidden;

	const invalid = validateRiceScore(score);
	if (invalid) return invalid;

	try {
		const store = getScoreStore();
		await Promise.all(items.map(({ issueId }) => store.setScore(org, projectId, issueId, score)));

		// Push computed RICE score back to GitHub using a single batched mutation.
		if (fieldId) {
			const computed = computeRiceScore(score);
			if (computed !== null) {
				const itemIds = items.map((i) => i.itemId);
				await client
					.batchUpdateProjectItemScores(projectId, itemIds, fieldId, Math.round(computed))
					.catch(() => {});
			}
		}

		return NextResponse.json({ updated: items.length });
	} catch (err) {
		return handleApiError(err);
	}
}
