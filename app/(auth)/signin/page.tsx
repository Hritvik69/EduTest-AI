import { redirect } from "next/navigation";
import Link from "next/link";
import { authMode } from "@/lib/api-security";

export default function SignInPage() {
  if (authMode() === "guest") {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-background p-6 text-slate-100">
      <div className="safe-container flex min-h-screen max-w-md flex-col justify-center">
        <h1 className="text-3xl font-extrabold text-white">Sign in</h1>
        <p className="mt-3 text-slate-300">
          Continue with your configured Google account to use protected EduTest AI data.
        </p>
        <Link
          href="/api/auth/signin/google"
          className="mt-6 inline-flex h-12 items-center justify-center rounded-lg bg-blue-600 px-5 font-bold text-white transition hover:bg-blue-500"
        >
          Continue with Google
        </Link>
      </div>
    </main>
  );
}
