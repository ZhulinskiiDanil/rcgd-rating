import { initializeHeadAdmin } from "../server/services/initialize";
import { synchronize } from "../server/services/sync";
if (!process.env.HEAD_ADMIN_LOGIN || !process.env.HEAD_ADMIN_PASSWORD)
  throw new Error("Задайте HEAD_ADMIN_LOGIN и HEAD_ADMIN_PASSWORD в .env");
console.log(
  initializeHeadAdmin()
    ? "Head-admin создан. Пароль не выводится."
    : "Head-admin уже существует; права и пароль сохранены.",
);
console.log(await synchronize());
