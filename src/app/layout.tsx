import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { auth } from "@/auth";

export const metadata: Metadata = {
	title: "GitRice — RICE Scoring for GitHub Projects",
	description: "GitRice — RICE scoring for GitHub Projects",
};

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth();

	return (
		<html lang="en">
			<body className="min-h-screen bg-github-canvas text-github-fg antialiased">
				{session && <Nav user={session.user} />}
				{children}
			</body>
		</html>
	);
}
