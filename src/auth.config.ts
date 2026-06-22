import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
    newUser: "/onboarding",
  },
  providers: [], // Configured in auth.ts due to Prisma adapter constraints
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthRoute = nextUrl.pathname.startsWith('/login') || nextUrl.pathname.startsWith('/register');
      const isOnboardingRoute = nextUrl.pathname.startsWith('/onboarding') || nextUrl.pathname.startsWith('/verify');

      if (isAuthRoute) {
        if (isLoggedIn) {
          return Response.redirect(new URL('/', nextUrl));
        }
        return true;
      }

      // Force first-time admin to set a secure password before anything else.
      if (isLoggedIn && auth.user.mustSetPassword && !isOnboardingRoute) {
        return Response.redirect(new URL('/onboarding/set-password', nextUrl));
      }

      // If logged in but no username (meaning they haven't finished onboarding)
      // Force them to onboarding.
      if (isLoggedIn && !auth.user.username && !isOnboardingRoute) {
         return Response.redirect(new URL('/onboarding', nextUrl));
      }

      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.mustSetPassword = user.mustSetPassword;
      }
      if (trigger === "update") {
        if (session?.username) token.username = session.username;
        if (session?.mustSetPassword !== undefined) token.mustSetPassword = session.mustSetPassword;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string | undefined;
        session.user.mustSetPassword = token.mustSetPassword as boolean | undefined;
      }
      return session;
    }
  },
} satisfies NextAuthConfig;
