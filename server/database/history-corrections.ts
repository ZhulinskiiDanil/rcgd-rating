import type Database from "better-sqlite3";
import {
  correctRemovalNote,
  readStoredMovements,
  storedLevelNote,
  withoutHistoryQuotes,
  type LevelMovement,
} from "../services/list-events";
import { permanentIds } from "./mika-purge";

const migrationKey = "historyCorrections20261008";

function sentences(title: string, names: string[], separator = ". ") {
  const nameSpans = [...new Set(names.filter(Boolean))].flatMap((name) => {
    const spans: [number, number][] = [];
    for (
      let start = title.indexOf(name);
      start >= 0;
      start = title.indexOf(name, start + name.length)
    )
      spans.push([start, start + name.length]);
    return spans;
  });
  const parts: string[] = [];
  let start = 0;
  for (
    let end = title.indexOf(separator);
    end >= 0;
    end = title.indexOf(separator, end + separator.length)
  ) {
    if (nameSpans.some(([from, to]) => from <= end && to > end + 1)) continue;
    parts.push(title.slice(start, end));
    start = end + separator.length;
  }
  parts.push(title.slice(start));
  return parts;
}

export function correctHistoryTitle(
  title: string,
  movements: LevelMovement[],
  names: string[] = [],
  primaryId: number | null = null,
) {
  title = withoutHistoryQuotes(title);
  const allNames = [...names, ...movements.map((row) => row.name)];
  const removed = movements
    .filter(
      (movement) => movement.toTier === null && movement.fromTier !== null,
    )
    .map((movement) => `${movement.name} удалён из листа`);
  const outgoing: string[] = [];
  const descriptions = sentences(title, allNames)
    .flatMap((sentence) => {
      if (!sentence.startsWith("В связи с этим ")) return [sentence];
      const clauses = sentences(
        sentence.slice("В связи с этим ".length),
        allNames,
        ", ",
      );
      return clauses.every((clause) =>
        movements.some(
          (movement) =>
            clause.startsWith(`${movement.name} переходит в `) ||
            clause.startsWith(`${movement.name} вылетает в `) ||
            clause.startsWith(`${movement.name} вылетел в `),
        ),
      )
        ? clauses
        : [sentence];
    })
    .map((original) => {
      let sentence = original;
      for (const movement of movements) {
        const name = movement.name;
        if (movement.toTier === null && movement.fromTier !== null) {
          if (
            sentence === `${name} удалён из листа` ||
            sentence === `${name} удален из листа`
          ) {
            return "";
          }
        }
        if (movement.fromTier === "main" && movement.toTier === "extended") {
          for (const verb of [
            "переходит в",
            "перешёл в",
            "вылетел из Main list в",
            "вылетел в",
          ])
            if (sentence.startsWith(`${name} ${verb} Extended list`))
              sentence = `${name} вылетает в Extended list${sentence.slice(`${name} ${verb} Extended list`.length)}`;
          if (sentence.startsWith(`${name} вылетает в Extended list`)) {
            outgoing.push(sentence);
            return "";
          }
        }
        const returned =
          movement.fromTier === "legacy" ||
          (movement.fromTier === "extended" && movement.toTier === "main");
        if (
          returned &&
          (movement.toTier === "main" || movement.toTier === "extended")
        ) {
          const tier = movement.toTier === "main" ? "Main" : "Extended";
          for (const verb of ["вернулся в", "переходит в", "перешёл в"]) {
            const prefix = `${name} ${verb} ${tier} list`;
            if (
              sentence.startsWith(prefix) &&
              /^(?:$| на \d+ место(?:$|[ (]))/.test(
                sentence.slice(prefix.length),
              )
            )
              sentence = `${name} вернулся в ${tier} list`;
          }
        }
        if (
          movement.toTier === "legacy" &&
          sentence.startsWith(`${name} вылетает в Legacy list`)
        )
          sentence = `${name} вылетел в Legacy list${sentence.slice(`${name} вылетает в Legacy list`.length)}`;
        if (
          movement.toTier === "legacy" &&
          sentence.startsWith(`${name} вылетел в Legacy list`)
        ) {
          const reason = storedLevelNote(
            movement.levelId,
            primaryId,
            JSON.stringify({ movements }),
          );
          if (reason.includes("выше этого уровня") && !title.includes(reason))
            sentence += `. ${reason}`;
        }
      }
      return sentence;
    })
    .filter(Boolean);
  return [...removed, ...outgoing, ...descriptions].join(". ");
}

export function migrateHistoryCorrections(connection: Database.Database) {
  if (
    connection.prepare("SELECT 1 FROM settings WHERE key=?").get(migrationKey)
  )
    return;
  connection.transaction(() => {
    const updatedAt = new Date().toISOString();
    permanentIds(connection, "levelHistory");
    const deleted = connection
      .prepare(
        "DELETE FROM levelHistory WHERE changeId IN (SELECT id FROM changes WHERE public=1 AND deletedAt IS NOT NULL)",
      )
      .run().changes;
    const names = (
      connection.prepare("SELECT name FROM levels").all() as { name: string }[]
    ).map((row) => row.name);
    const events = connection
      .prepare(
        "SELECT id,entityId,title,afterJson FROM changes WHERE kind='level' AND public=1 AND deletedAt IS NULL",
      )
      .all() as {
      id: number;
      entityId: number | null;
      title: string;
      afterJson: string | null;
    }[];
    const history = connection.prepare(
      "SELECT h.id,h.levelId,h.fromRank,h.toRank,h.fromTier,h.toTier,h.note,h.noteEdited,l.name FROM levelHistory h LEFT JOIN levels l ON l.id=h.levelId WHERE h.changeId=?",
    );
    const updateTitle = connection.prepare(
      "UPDATE changes SET title=?,afterJson=?,updatedAt=? WHERE id=?",
    );
    const updateNote = connection.prepare(
      "UPDATE levelHistory SET note=?,updatedAt=? WHERE id=?",
    );
    let correctedTitles = 0,
      correctedNotes = 0;
    for (const event of events) {
      const stored = readStoredMovements(event.afterJson);
      const rows = history.all(event.id) as (Omit<LevelMovement, "name"> & {
        id: number;
        noteEdited: number;
        name: string | null;
      })[];
      const movements = [...stored];
      for (const row of rows)
        if (
          row.name &&
          !movements.some((movement) => movement.levelId === row.levelId)
        )
          movements.push({ ...row, name: row.name });
      const title = correctHistoryTitle(
        event.title,
        movements,
        names,
        event.entityId,
      );
      for (const row of rows) {
        if (row.noteEdited) continue;
        const movement = movements.find((item) => item.levelId === row.levelId);
        if (!movement) continue;
        let note = correctRemovalNote(
          withoutHistoryQuotes(row.note),
          movement,
          movements,
        );
        if (!note || note === "Подвинут")
          note =
            storedLevelNote(
              row.levelId,
              event.entityId,
              JSON.stringify({ movements }),
            ) || note;
        if (note !== row.note) {
          updateNote.run(note, updatedAt, row.id);
          correctedNotes++;
        }
      }
      let afterJson = event.afterJson;
      if (
        stored.some(
          (movement) =>
            correctRemovalNote(movement.note, movement, movements) !==
            movement.note,
        )
      ) {
        const saved = JSON.parse(event.afterJson!);
        for (const movement of saved.movements as LevelMovement[])
          movement.note = correctRemovalNote(
            movement.note ?? "",
            movement,
            movements,
          );
        afterJson = JSON.stringify(saved);
      }
      if (title !== event.title || afterJson !== event.afterJson) {
        updateTitle.run(title, afterJson, updatedAt, event.id);
        if (title !== event.title) correctedTitles++;
      }
    }
    connection.prepare("INSERT INTO settings(key,value) VALUES(?,?)").run(
      migrationKey,
      JSON.stringify({
        deleted,
        correctedTitles,
        correctedNotes,
        completedAt: new Date().toISOString(),
      }),
    );
  })();
}
