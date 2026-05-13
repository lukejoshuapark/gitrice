import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getGitHubClient } from "@/lib/github/client";

export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.accessToken) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const projectId = request.nextUrl.searchParams.get("projectId");
	if (!projectId) {
		return NextResponse.json({ error: "Missing projectId parameter" }, { status: 400 });
	}

	try {
		const client = getGitHubClient(session.accessToken);

		// Run both GitHub calls in parallel to save one round-trip vs. having the
		// client fire /api/projects/fields as a separate request.
		const [issues, riceScoreFieldId] = await Promise.all([
			client.getProjectItems(projectId),
			client.getProjectRiceFieldId(projectId),
		]);

		return NextResponse.json({ issues, riceScoreFieldId });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
