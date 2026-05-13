export interface GitHubOrg {
	login: string;
	avatarUrl: string;
}

export interface GitHubProject {
	id: string;
	number: number;
	title: string;
	closed: boolean;
}

export interface GitHubMilestone {
	title: string;
	number: number;
}

export interface GitHubIssue {
	id: string;
	projectItemId: string;
	number: number;
	title: string;
	state: "OPEN" | "CLOSED";
	url: string;
	type: "Issue" | "PullRequest" | "DraftIssue";
	assignees: GitHubUser[];
	milestone: GitHubMilestone | null;
	author: GitHubUser | null;
}

export interface GitHubUser {
	login: string;
	avatarUrl: string;
}

export interface RiceScore {
	reach: number | null;
	impact: number | null;
	confidence: number | null;
	effort: number | null;
}

export interface IssueWithScore extends GitHubIssue {
	score: RiceScore;
	computedScore: number | null;
}
