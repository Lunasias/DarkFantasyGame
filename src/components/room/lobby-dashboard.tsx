"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMeAction, logoutAction } from "@/lib/auth/actions";
import type { AuthUser } from "@/lib/auth/auth-service";
import { unwrap } from "@/lib/unwrap";
import { CreateRoomForm } from "./create-room-form";
import { JoinRoomForm } from "./join-room-form";

export function LobbyDashboard() {
  const router = useRouter();
  const [me, setMe] = useState<AuthUser | null>(null);

  useEffect(() => {
    unwrap(getMeAction())
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-6 py-16">
      <div className="text-center">
        <p className="text-sm text-zinc-400">
          Welcome, <span className="text-zinc-200">{me?.displayName ?? "player"}</span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Lobby</h1>
      </div>

      <div className="grid w-full max-w-3xl gap-6 sm:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
          <h2 className="mb-3 font-medium">Create a room</h2>
          <CreateRoomForm />
        </section>
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
          <h2 className="mb-3 font-medium">Join by code</h2>
          <JoinRoomForm />
        </section>
      </div>

      <button
        onClick={async () => {
          await unwrap(logoutAction());
          router.push("/login");
        }}
        className="text-sm text-zinc-500 underline hover:text-zinc-300"
      >
        Log out
      </button>
    </main>
  );
}
