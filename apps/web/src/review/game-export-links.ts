// Download links for a finished game's canonical exports (the Game Publishing
// Track's `/api/games/:roomId/export.{pgn,json}`): the PGN with the CC BY header
// and the schema-v1.0 JSON. Every postgame surface hands the result to the
// Share & export tab through `shareExtra`, so the downloads live in one place
// across variants (lichess: the "Share & export" underboard tab). Which formats
// a variant offers comes from the shared table in @mistboard/game, the same one
// the server gates on, so a link never points at a 501.

import { exportFormatsForVariant, type GameExportFormat } from '@mistboard/game';
import { type DownloadLink, downloadRow } from './underboard-tabs.js';

export function gameExportLinks(
  roomId: string,
  formats: readonly GameExportFormat[],
): DownloadLink[] {
  const encoded = encodeURIComponent(roomId);
  return formats.map((format) => ({
    text: format.toUpperCase(),
    href: `/api/games/${encoded}/export.${format}`,
    filename: `mistboard-${roomId}.${format}`,
  }));
}

/** The `shareExtra` config for a finished game of `variant`: one Download row
 *  with a link per exportable format, or nothing when the variant exports none
 *  (the row is omitted rather than shown empty). Spread it into the review config. */
export function gameExportShareExtra(
  variant: string,
  roomId: string,
): { shareExtra: HTMLElement[] } | Record<string, never> {
  const formats = exportFormatsForVariant(variant);
  if (formats.length === 0) return {};
  return { shareExtra: [downloadRow(gameExportLinks(roomId, formats))] };
}
