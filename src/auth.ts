import NextAuth from "next-auth";
import { customFetch } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import https from "node:https";

const originalFetch = globalThis.fetch.bind(globalThis);
let githubFetchPatched = false;

async function githubIPv4Fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);

  if (url.protocol !== "https:") {
    return originalFetch(request);
  }

  const bodyBuffer = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : Buffer.from(await request.arrayBuffer());

  const outgoingHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    outgoingHeaders[key] = value;
  });

  if (!outgoingHeaders["user-agent"]) {
    outgoingHeaders["user-agent"] = "next-auth";
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 443,
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers: outgoingHeaders,
        family: 4,
        timeout: 20000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (Array.isArray(value)) {
              headers.set(key, value.join(", "));
            } else if (typeof value === "string") {
              headers.set(key, value);
            }
          }

          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 500,
              statusText: res.statusMessage ?? "",
              headers,
            })
          );
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("GitHub OAuth request timed out over IPv4 transport"));
    });
    req.on("error", reject);

    if (bodyBuffer) {
      req.write(bodyBuffer);
    }
    req.end();
  });
}

function installGithubFetchPatch() {
  if (githubFetchPatched) return;
  githubFetchPatched = true;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const isGithubHost = url.hostname === "github.com" || url.hostname === "api.github.com";

    if (isGithubHost) {
      return githubIPv4Fetch(request);
    }

    return originalFetch(request);
  };
}

installGithubFetchPatch();

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    GitHubProvider({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      [customFetch]: githubIPv4Fetch,
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: { label: "Email or Username", type: "text", placeholder: "student@istanbularel.edu" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) {
          return null;
        }

        const identifier = credentials.identifier as string;
        
        // Find user by either email or username
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: identifier },
              { username: identifier }
            ]
          },
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            passwordHash: true,
            mustSetPassword: true,
          },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isPasswordValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username ?? undefined,
          mustSetPassword: user.mustSetPassword,
        };
      }
    })
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { emailVerified: true, email: true, mustSetPassword: true },
      });

      // If the user's email is unverified, block them or redirect based on their provider.
      // This checks regardless of whether they have a username or not, securing github users too.
      if (dbUser && !dbUser.emailVerified) {
          if (account?.provider === "credentials") {
             throw new Error("AccessDenied");
          } else {
             return `/verify-email?email=${encodeURIComponent(dbUser.email!)}`;
          }
      }

      // OAuth providers don't go through authorize(), so mustSetPassword won't be on the
      // user object — stamp it here so the jwt callback can write it into the token.
      if (dbUser?.mustSetPassword) {
        user.mustSetPassword = true;
      }

      return true;
    },
  }
});
