import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getGitHubClient } from "@/lib/github/client";

export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.accessToken) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const org = request.nextUrl.searchParams.get("org");
	if (!org) {
		return NextResponse.json({ error: "Missing org parameter" }, { status: 400 });
	}

	try {
		const client = getGitHubClient(session.accessToken);
		const projects = await client.getOrgProjects(org);
		return NextResponse.json(projects, {
			headers: { "Cache-Control": "private, no-store" },
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
