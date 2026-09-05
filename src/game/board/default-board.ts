import { Board } from "./board";
import { BoardNode } from "./node";

/**
 * The canonical, static authoritative board definition.
 *
 * The board topology is data-driven in code (not rendered, not camera/frame)
 * and is the same for every session/server instance, so it is always
 * reconstructable server-side without persisting graph rows. Movement is
 * validated against this graph. Stable node ids + bidirectional edges.
 */
export function createDefaultBoard(): Board {
  const board = new Board();
  board.addNode(new BoardNode({ id: "A", label: "Barrow Gate", kind: "start" }));
  board.addNode(new BoardNode({ id: "B", label: "Ashen Path", kind: "normal" }));
  board.addNode(new BoardNode({ id: "C", label: "Old Village", kind: "town" }));
  board.addNode(new BoardNode({ id: "D", label: "Gravewood", kind: "dungeon" }));
  board.addNode(new BoardNode({ id: "E", label: "Black Ash Store", kind: "shop" }));
  board.connect("A", "B");
  board.connect("B", "C");
  board.connect("B", "E");
  board.connect("C", "D");
  board.assertValid();
  return board;
}
