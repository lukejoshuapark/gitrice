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
		const riceScoreFieldId = await client.getProjectRiceFieldId(projectId);
		return NextResponse.json({ riceScoreFieldId });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
