import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
	const session = await auth();

	if (session) {
		redirect("/dashboard");
	}

	return (
		<main className="flex min-h-screen flex-col items-center justify-center bg-github-canvas px-4">
			<div className="w-full max-w-sm space-y-6">
				{/* Logo */}
				<div className="flex flex-col items-center gap-3">
					<svg height="48" width="48" viewBox="0 0 16 16" fill="#0d1117" aria-hidden="true">
						<path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
					</svg>
					<h1 className="text-2xl font-semibold text-github-fg">Sign in to GitRice</h1>
					<p className="text-sm text-github-fg-muted text-center">
						RICE scoring for GitHub Projects
					</p>
				</div>

				{/* Sign-in card */}
				<div className="rounded-md border border-github-border bg-white p-6 shadow-sm">
					<form
						action={async () => {
							"use server";
							await signIn("github", { redirectTo: "/dashboard" });
						}}
					>
						<button
							type="submit"
							className="flex w-full items-center justify-center gap-2 rounded-md bg-github-header px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-github-header focus:ring-offset-2"
						>
							<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
								<path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
							</svg>
							Sign in with GitHub
						</button>
					</form>
				</div>

				<p className="text-center text-xs text-github-fg-muted">
					Your data is only used to display and score GitHub project issues.
				</p>
			</div>
		</main>
	);
}
