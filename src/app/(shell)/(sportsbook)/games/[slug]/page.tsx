import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getGameBySlug } from "@/services/gamesService";
import { getT } from "@/i18n/server";
import { hasBoard } from "@/lib/games/registry";
import { GameRouter } from "@/components/games/GameRouter";
import { GameShell } from "@/components/games/GameShell";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const game = await getGameBySlug(slug);
  if (!game) return {};

  const t = await getT();
  return { title: game.nameKey ? t(game.nameKey) : (game.name ?? slug) };
}

export default async function GamePage({ params }: PageProps) {
  const { slug } = await params;
  const game = await getGameBySlug(slug);

  // A catalogue entry with no implementation is a 404 rather than an empty
  // frame: the lobby never links here for one, so reaching it means the data
  // and the code disagree.
  if (!game || game.status !== "playable" || !hasBoard(game.key)) notFound();

  return (
    <GameShell game={game}>
      <GameRouter gameKey={game.key!} />
    </GameShell>
  );
}
