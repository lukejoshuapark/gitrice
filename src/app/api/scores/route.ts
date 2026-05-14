import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getScoreStore } from "@/lib/storage";
import { getGitHubClient } from "@/lib/github/client";
import { computeRiceScore } from "@/lib/rice";
import type { RiceScore } from "@/types";

export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.accessToken) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const org = request.nextUrl.searchParams.get("org");
	const projectId = request.nextUrl.searchParams.get("projectId");

	if (!org || !projectId) {
		return NextResponse.json({ error: "Missing org or projectId parameter" }, { status: 400 });
	}

	const client = getGitHubClient(session.accessToken);
	if (!(await client.isOrgMember(org))) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	try {
		const store = getScoreStore();
		const scores = await store.getScores(org, projectId);
		return NextResponse.json(scores, {
			headers: { "Cache-Control": "no-store" },
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function PUT(request: NextRequest) {
	const session = await auth();
	if (!session?.accessToken) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const org = request.nextUrl.searchParams.get("org");
	const projectId = request.nextUrl.searchParams.get("projectId");
	const issueId = request.nextUrl.searchParams.get("issueId");
	const projectItemId = request.nextUrl.searchParams.get("projectItemId");
	const fieldId = request.nextUrl.searchParams.get("fieldId");

	if (!org || !projectId || !issueId) {
		return NextResponse.json({ error: "Missing org, projectId, or issueId parameter" }, { status: 400 });
	}

	const client = getGitHubClient(session.accessToken);
	if (!(await client.isOrgMember(org))) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	let body: Partial<RiceScore>;
	try {
		body = await request.json() as Partial<RiceScore>;
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	// Validate all provided values are numbers or null
	const fields = ["reach", "impact", "confidence", "effort"] as const;
	for (const field of fields) {
		const val = body[field];
		if (val !== undefined && val !== null && typeof val !== "number") {
			return NextResponse.json({ error: `Invalid value for ${field}` }, { status: 400 });
		}
	}

	try {
		const store = getScoreStore();
		// setScore now returns the merged score, avoiding a second getScores() call
		const merged = await store.setScore(org, projectId, issueId, body);

		// Optionally push computed RICE score back to the GitHub project custom field
		if (projectItemId && fieldId) {
			const computed = computeRiceScore(merged);
			if (computed !== null) {
				await client.updateProjectItemScore(projectId, projectItemId, fieldId, Math.round(computed)).catch(() => {});
			} else if (merged.reach === null && merged.impact === null && merged.confidence === null && merged.effort === null) {
				await client.clearProjectItemScore(projectId, projectItemId, fieldId).catch(() => {});
			}
		}

		return NextResponse.json({ score: merged, computedScore: computeRiceScore(merged) });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
