import { importAchievements, importSheet } from "../server/services/sync";
import {
  parseAchievements,
  parseSheet,
  sourceText,
  SHEET,
  sheetTab,
} from "../server/services/sources";
import { mutate } from "../server/services/changes";
// Repeatable additive import: existing records and manual edits are preserved.
const names = parseSheet(await sourceText(SHEET));
const players = parseAchievements(await sourceText(sheetTab("Игроки")));
const districts = parseAchievements(await sourceText(sheetTab("Районы")));
const unmatched = mutate("Дополнение из исходной таблицы", null, () => [
  ...importSheet(names),
  ...importAchievements(players, "players"),
  ...importAchievements(districts, "districts"),
]);
console.log({
  players: players.length,
  districts: districts.length,
  unmatched,
});
