import { CreateRoomForm } from "@/components/room/create-room-form";

export default function CreateRoomPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
        <h1 className="mb-4 text-xl font-semibold">Create a room</h1>
        <CreateRoomForm />
      </div>
    </main>
  );
}
