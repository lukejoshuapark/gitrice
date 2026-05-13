import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getScoreStore } from "@/lib/storage";
import { getGitHubClient } from "@/lib/github/client";
import { computeRiceScore } from "@/lib/rice";
import type { RiceScore } from "@/types";

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.accessToken) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

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

	const client = getGitHubClient(session.accessToken);
	if (!(await client.isOrgMember(org))) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const fields = ["reach", "impact", "confidence", "effort"] as const;
	for (const field of fields) {
		const val = score[field];
		if (val !== undefined && val !== null && typeof val !== "number") {
			return NextResponse.json({ error: `Invalid value for ${field}` }, { status: 400 });
		}
	}

	try {
		const store = getScoreStore();
		await Promise.all(items.map(({ issueId }) => store.setScore(org, projectId, issueId, score)));

		// Push computed RICE score back to GitHub using a single batched mutation
		// instead of N separate requests.
		if (fieldId) {
			const computed = computeRiceScore(score);
			if (computed !== null) {
				const itemIds = items.map((i) => i.itemId);
				await client
					.batchUpdateProjectItemScores(projectId, itemIds, fieldId, Math.round(computed))
					.catch(() => {
						// Non-fatal: GitHub sync failure does not fail the local save
					});
			}
		}

		return NextResponse.json({ updated: items.length });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
