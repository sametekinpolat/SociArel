"use server";

import { signIn, signOut, auth } from "@/auth";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { generateVerificationToken } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/mail";
import { LoginSchema, RegisterSchema, OnboardingSchema } from "@/lib/validations/auth";
import { checkRateLimit, loginRateLimit, registerRateLimit, emailRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

async function getIp() {
  const currentHeaders = await headers();
  const forwardedFor = currentHeaders.get("x-forwarded-for");
  const realIp = currentHeaders.get("x-real-ip");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  if (realIp) return realIp.trim();
  return "127.0.0.1"; // DEFAULT IP IF LOCAL
}

export async function loginAction(formData: FormData) {
  const ip = await getIp();
  const { success: rlSuccess } = await checkRateLimit(loginRateLimit, ip);

  if (!rlSuccess) {
    return { error: "Too many login attempts. Please try again later." };
  }

  const rawData = Object.fromEntries(formData.entries());
  const validated = LoginSchema.safeParse(rawData);

  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  const { identifier, password } = validated.data;
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: identifier },
        { username: identifier }
      ]
    },
    select: {
      email: true,
      emailVerified: true,
    }
  });

  try {
    await signIn("credentials", {
      identifier,
      password,
      redirect: false,
    });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin" || error.message.includes("CredentialsSignin")) {
        return { error: "Invalid credentials" };
      }
      if (error.type === "AccessDenied") {
        return {
          error: "Please verify your email to log in.",
          requiresVerification: true,
          email: existingUser?.email ?? identifier,
        };
      }
      return { error: "Something went wrong during login" };
    }

    if (
      error instanceof Error &&
      error.message.includes("AccessDenied") &&
      existingUser?.email &&
      !existingUser.emailVerified
    ) {
      return {
        error: "Please verify your email to log in.",
        requiresVerification: true,
        email: existingUser.email,
      };
    }

    throw error;
  }
}

export async function loginWithGithub() {
  await signIn("github");
}

export async function logoutAction() {
  await signOut();
}

export async function checkUsernameAvailability(username: string) {
  if (!username || username.trim() === "") return null;
  const existing = await prisma.user.findUnique({
    where: { username }
  });
  return !existing;
}

export async function resendVerificationEmailAction(email: string) {
  const ip = await getIp();
  const { success: rlSuccess } = await checkRateLimit(emailRateLimit, ip);

  if (!rlSuccess) {
    return { error: "Too many emails sent. Please wait before trying again." };
  }

  if (!email) return { error: "No email provided." };
  try {
    const existingUser = await prisma.user.findFirst({ where: { email } });
    if (!existingUser) return { error: "User not found." };
    if (existingUser.emailVerified) return { error: "Email is already verified." };

    const verificationToken = await generateVerificationToken(email);

    // try sending email fail if error is thrown
    await sendVerificationEmail(verificationToken.identifier, verificationToken.token);

    return { success: true };
  } catch (err) {
    console.error("Resend error:", err);
    return { error: "Failed to send the verification email. Please try again or check SMTP config." };
  }
}

export async function registerAction(formData: FormData) {
  const ip = await getIp();
  const { success: rlSuccess } = await checkRateLimit(registerRateLimit, ip);

  if (!rlSuccess) {
    return { error: "Too many registrations from this IP. Please try again later." };
  }

  const rawData = Object.fromEntries(formData.entries());
  const validated = RegisterSchema.safeParse(rawData);

  if (!validated.success) {
    return { error: "Validation failed: " + validated.error.issues[0].message };
  }

  const { email, username, password } = validated.data;

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }]
      }
    });

    if (existingUser) {
      if (existingUser.email === email) return { error: "Email already in use" };
      if (existingUser.username === username) return { error: "Username already taken" };
      return { error: "User already exists" };
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
      }
    });




    const verificationToken = await generateVerificationToken(user.email!);

    try {
      await sendVerificationEmail(verificationToken.identifier, verificationToken.token);
      return { success: true, emailSent: true, email: user.email };
    } catch {
      return { error: "Account created but failed to send verification email. Please try logging in and requesting a new one.", emailSent: false, email: user.email };
    }

  } catch (error) {
    console.error("Registration error:", error);
    return { error: "An error occurred during registration" };
  }
}

export async function completeOnboardingAction(formData: FormData) {
  const ip = await getIp();
  const { success: rlSuccess } = await checkRateLimit(registerRateLimit, ip);

  if (!rlSuccess) {
    return { error: "Too many requests. Please try again later." };
  }

  const rawData = Object.fromEntries(formData.entries());
  const validated = OnboardingSchema.safeParse(rawData);

  if (!validated.success) {
    return { error: "Validation failed: " + validated.error.issues[0].message };
  }

  const { email, username, userId } = validated.data;

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
        NOT: { id: userId }
      }
    });

    if (existingUser) {
      if (existingUser.email === email) return { error: "Email already in use" };
      if (existingUser.username === username) return { error: "Username already taken" };
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        email,
        username,
        emailVerified: null,
      }
    });

    const verificationToken = await generateVerificationToken(email);

    try {
      await sendVerificationEmail(verificationToken.identifier, verificationToken.token);
      return { success: true, email };
    } catch {
      return { error: "Onboarding successful but failed to send verification email. Please try logging in and requesting a new one.", email };
    }
  } catch (err) {
    console.error("Onboarding error:", err);
    return { error: "Something went wrong during onboarding." };
  }
}

export async function setPasswordAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated." };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustSetPassword: true },
  });

  if (!user?.mustSetPassword) return { error: "Not allowed." };

  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (!password || password.length < 12) {
    return { error: "Password must be at least 12 characters." };
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return { error: "Password must contain uppercase, lowercase, and a number." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const hash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: hash, mustSetPassword: false },
  });

  return { success: true };
}


