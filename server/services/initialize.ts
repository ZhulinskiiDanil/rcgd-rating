import { db, one } from "../database";
import { hashSecret } from "./password";
export function initializeHeadAdmin() {
  if (one("SELECT id FROM accounts WHERE headAdmin=1")) return false;
  const login = process.env.HEAD_ADMIN_LOGIN?.trim(),
    password = process.env.HEAD_ADMIN_PASSWORD;
  if (!login && !password) return false;
  if (
    !login ||
    !/^[a-zA-Z0-9_.-]{3,32}$/.test(login) ||
    !password ||
    password.length < 8
  )
    throw new Error(
      "Задайте HEAD_ADMIN_LOGIN (3–32 латинских символа) и HEAD_ADMIN_PASSWORD (минимум 8 символов)",
    );
  if (one("SELECT id FROM accounts WHERE login=?", login))
    throw new Error(
      "Логин head-admin уже занят. Автоматическое повышение прав запрещено.",
    );
  db()
    .prepare(
      "INSERT INTO accounts(login,passwordHash,headAdmin) VALUES (?,?,1)",
    )
    .run(login, hashSecret(password));
  return true;
}
