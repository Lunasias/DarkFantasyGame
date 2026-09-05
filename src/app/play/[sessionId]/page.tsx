import { GameScreen } from "@/components/game/game-screen";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <GameScreen sessionId={sessionId} />;
}
