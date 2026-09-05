import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
        <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
        <AuthForm mode="login" />
        <p className="mt-4 text-sm text-zinc-400">
          No account?{" "}
          <Link href="/register" className="text-zinc-200 underline">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}
