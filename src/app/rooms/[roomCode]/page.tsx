import { RoomLobby } from "@/components/room/room-lobby";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = await params;
  return <RoomLobby roomCode={roomCode} />;
}
