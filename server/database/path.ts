import { isAbsolute, relative, resolve, sep } from "node:path";

export function resolveDatabasePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const railway = Boolean(
    env.RAILWAY_ENVIRONMENT_ID ||
    env.RAILWAY_PROJECT_ID ||
    env.RAILWAY_SERVICE_ID ||
    env.RAILWAY_DEPLOYMENT_ID,
  );
  if (!railway) return resolve(env.DATABASE_PATH || ".data/spb.sqlite");

  const mount = env.RAILWAY_VOLUME_MOUNT_PATH;
  if (!mount || !isAbsolute(mount))
    throw new Error(
      "Railway: постоянный volume не подключён (нет абсолютного RAILWAY_VOLUME_MOUNT_PATH). Подключите volume к сервису по пути /data до запуска. Создание временной SQLite-базы запрещено.",
    );

  const file = env.DATABASE_PATH;
  if (!file || !isAbsolute(file))
    throw new Error(
      "Railway: задайте абсолютный DATABASE_PATH внутри подключённого volume, например /data/spb.sqlite. Создание временной SQLite-базы запрещено.",
    );

  const resolvedFile = resolve(file);
  const inside = relative(resolve(mount), resolvedFile);
  if (
    !inside ||
    inside === ".." ||
    inside.startsWith(`..${sep}`) ||
    isAbsolute(inside)
  )
    throw new Error(
      "Railway: DATABASE_PATH должен указывать на файл внутри RAILWAY_VOLUME_MOUNT_PATH. Проверьте volume и путь базы, например /data/spb.sqlite. Запуск остановлен, чтобы не потерять данные при деплое.",
    );
  return resolvedFile;
}
