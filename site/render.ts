import type { LeaderboardRow } from "../src/types";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ranks(rows: LeaderboardRow[]): number[] {
  const result: number[] = [];
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    result.push(previous && previous.points === row.points ? result[index - 1]! : index + 1);
  });
  return result;
}

export function renderLeaderboard(rows: LeaderboardRow[]): string {
  if (rows.length === 0) {
    return `<p class="empty">No players registered yet.</p>`;
  }

  const rank = ranks(rows);
  const body = rows
    .map(
      (row, index) => `
      <tr>
        <td class="rank">${rank[index]}</td>
        <td class="player">
          <span class="fom">${escapeHtml(row.fom)}</span>
          <span class="ingame">${escapeHtml(row.ingame)}</span>
        </td>
        <td class="points">${row.points}</td>
        <td>${row.raceWins}</td>
        <td>${row.finalsReached}</td>
        <td>${row.finalsWon}</td>
      </tr>`,
    )
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Points</th>
          <th title="Race rounds won">Races</th>
          <th title="Finals reached">Finals</th>
          <th title="Finals won">Wins</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}
