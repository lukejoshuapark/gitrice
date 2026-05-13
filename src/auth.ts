import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, signIn, signOut, auth } = NextAuth({
	providers: [
		GitHub({
			authorization: {
				params: {
					scope: "read:org project",
				},
			},
		}),
	],
	callbacks: {
		async jwt({ token, account }) {
			if (account) {
				token.accessToken = account.access_token;
				// GitHub classic OAuth tokens don't expire, but fine-grained tokens do.
				// Store expiry in ms so we can drop stale tokens on subsequent requests.
				token.accessTokenExpires = account.expires_at
					? account.expires_at * 1000
					: undefined;
			}
			// Drop the token once it has a known expiry that has passed.
			if (token.accessTokenExpires && Date.now() > token.accessTokenExpires) {
				token.accessToken = undefined;
			}
			return token;
		},
		async session({ session, token }) {
			if (token.accessToken) {
				session.accessToken = token.accessToken;
			}
			return session;
		},
	},
});
