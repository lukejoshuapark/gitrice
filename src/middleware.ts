import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
	if (!req.auth) {
		const signInUrl = new URL("/", req.url);
		return NextResponse.redirect(signInUrl);
	}
	return NextResponse.next();
});

export const config = {
	matcher: ["/dashboard/:path*"],
};
