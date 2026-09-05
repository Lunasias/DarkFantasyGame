"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loginAction, registerAction } from "@/lib/auth/actions";
import { unwrap } from "@/lib/unwrap";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await unwrap(registerAction({ email, password, displayName }));
      } else {
        await unwrap(loginAction({ email, password }));
      }
      router.push("/lobby");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {mode === "register" && (
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Display name"
          autoComplete="username"
          className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
        />
      )}
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        autoComplete="email"
        required
        className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        required
        className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        disabled={busy}
        className="rounded bg-zinc-100 px-4 py-2 font-medium text-zinc-900 disabled:opacity-50"
      >
        {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
