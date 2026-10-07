import { PERMISSIONS, permissionLabels } from "#shared/types/domain";
import type { AdminData, EntityResource, EntitySchema } from "~/types/admin";

export function useAdminSchemas(data: Ref<AdminData | null | undefined>) {
  const levelOptions = computed(
    () =>
      data.value?.levels.map((l) => ({
        value: l.id,
        label: `${l.name} · ${l.creator} · глобал ${l.globalRank ?? "—"} · ID ${l.id}`,
        disabled: !!l.deletedAt,
      })) ?? [],
  );
  const playerOptions = computed(
    () =>
      data.value?.players.map((p) => ({
        value: p.id,
        label: `${p.name} · ID ${p.id}`,
        disabled: !!p.deletedAt,
      })) ?? [],
  );
  const districtOptions = computed(
    () =>
      data.value?.districts.map((d) => ({
        value: d.id,
        label: `${d.name} · ${d.region === "spb" ? "СПб" : "ЛО"}`,
      })) ?? [],
  );
  const regionPlayers = (region: "spb" | "lo") =>
    data.value?.players
      .filter(
        (player) =>
          !player.deletedAt &&
          data.value?.districts.some(
            (district) =>
              district.id === player.districtId && district.region === region,
          ),
      )
      .map((player) => player.id) ?? [];
  return computed<Record<EntityResource, EntitySchema>>(() => ({
    players: {
      fields: [
        { key: "name", label: "Ник", required: true },
        {
          key: "districtId",
          label: "Район",
          type: "select",
          valueType: "number",
          options: districtOptions.value,
        },
        {
          key: "gdlId",
          label: "ID профиля Demonlist",
          type: "number",
          help: "Число из адреса demonlist.org/profile/123. Не ID аккаунта Geometry Dash.",
        },
        {
          key: "accountId",
          label: "Аккаунт на этом сайте",
          type: "select",
          valueType: "number",
          options:
            data.value?.accountOptions.map((a) => ({
              value: a.id,
              label: `${a.displayName} · ID ${a.id}`,
            })) ?? [],
        },
        { key: "bio", label: "Описание", type: "textarea" },
        { key: "hidden", label: "Скрыть в рейтинге игроков", type: "checkbox" },
        {
          key: "inactive",
          label: "Неактивный игрок — выделять красным",
          type: "checkbox",
        },
        {
          key: "avatarUrl",
          label: "Аватар игрока",
          type: "image",
          help: "Своё изображение заменяет аватар привязанного аккаунта. Очисти поле, чтобы вернуть автоматический выбор.",
        },
      ],
      columns: [
        { key: "id", label: "ID" },
        { key: "name", label: "Ник" },
        { key: "districtName", label: "Район" },
        { key: "gdlId", label: "ID Demonlist" },
        { key: "accountId", label: "Аккаунт" },
      ],
      rows:
        data.value?.players.map((p) => ({
          ...p,
          districtName: data.value?.districts.find((d) => d.id === p.districtId)
            ?.name,
        })) ?? [],
    },
    levels: {
      fields: [
        {
          key: "name",
          label: "Название",
          required: true,
          help: "Название и автор импортированного уровня обновляются из глобала.",
        },
        { key: "creator", label: "Опубликовано" },
        { key: "gdlId", label: "ID уровня в Global Demonlist", type: "number" },
        {
          key: "globalRank",
          label: "Позиция в Global Demonlist",
          type: "number",
          help: "Обновится при следующем импорте глобала.",
        },
        {
          key: "listPercent",
          label: "t — минимальный прогресс, %",
          type: "number",
        },
        {
          key: "endPercent",
          label: "T — последняя возможность умереть, %",
          type: "number",
        },
        {
          key: "thresholdSource",
          label: "Источник процентов",
          type: "select",
          nullable: true,
          options: [
            { value: "manual", label: "Вручную" },
            { value: "coreboard", label: "Coreboard" },
          ],
          help: "Изменённые вручную t/T сохраняются при синхронизации. Очисти источник для возврата к Coreboard.",
        },
        { key: "ingameId", label: "ID уровня в игре", type: "number" },
        {
          key: "manualPosition",
          label: "Место в СПб до появления в глобале",
          type: "number",
          help: "Для собственного уровня без глобальной позиции. Укажи место от 1 до 150 и добавь прохождение. После появления в Global Demonlist порядок обновится автоматически.",
        },
        { key: "length", label: "Длина уровня, секунд", type: "number" },
        { key: "gameVersion", label: "Версия игры", help: "Например: 2.2" },
        {
          key: "listExcluded",
          label: "Исключён из СПб-листа",
          type: "checkbox",
          help: "Сними флажок, чтобы вернуть удалённый уровень. Данные прохождений сохраняются.",
        },
        {
          key: "exitedAt",
          label: "Дата вылета в Legacy List",
          type: "date",
          visibleWhen: {
            key: "id",
            values:
              data.value?.levels
                .filter((level) => level.status === "legacy")
                .map((level) => level.id) ?? [],
          },
          help: "Исправленная дата сохраняется при синхронизации. Если уровень вернётся в лист и вылетит снова, будет указана новая дата вылета.",
        },
        {
          key: "previewImage",
          label: "Превью уровня",
          type: "image",
          help: "Обложка в списке и на странице уровня. Пустое поле возвращает автоматическое превью.",
        },
        {
          key: "showcaseVideo",
          label: "Видео на странице уровня",
          type: "url",
          help: "Ссылка на видео, которое нужно показывать посетителям. Синхронизация не меняет этот выбор.",
        },
        {
          key: "verificationPlayerId",
          label: "Оригинальный верификатор из СПб / области",
          type: "select",
          valueType: "number",
          nullable: true,
          options: playerOptions.value,
          help: "Укажи игрока, который впервые верифицировал уровень для публикации. Обычное прохождение сюда не относится.",
        },
        {
          key: "verificationRegion",
          label: "Регион оригинальной верификации",
          type: "select",
          nullable: true,
          options: [
            { value: "spb", label: "Санкт-Петербург" },
            { value: "lo", label: "Ленинградская область" },
          ],
        },
        {
          key: "verificationDate",
          label: "Дата оригинальной верификации",
          type: "date",
        },
        {
          key: "verifiedLocal",
          label: "Прохождение в СПб подтверждено отдельно",
          type: "checkbox",
        },
        {
          key: "thresholdName",
          label: "Точное название в Coreboard",
          help: "Для сопоставления одноимённых уровней. Пусто — автоматический выбор. Применится при следующей синхронизации.",
        },
      ],
      columns: [
        { key: "id", label: "ID" },
        { key: "name", label: "Название" },
        { key: "creator", label: "Автор" },
        { key: "localRank", label: "СПб" },
        { key: "globalRank", label: "Глобал" },
        { key: "status", label: "Статус" },
        { key: "thresholdLabel", label: "t / T" },
      ],
      rows:
        data.value?.levels.map((l) => ({
          ...l,
          thresholdLabel: `${l.listPercent ?? "—"} / ${l.endPercent ?? "—"}`,
        })) ?? [],
    },
    districts: {
      fields: [
        { key: "name", label: "Название", required: true },
        {
          key: "region",
          label: "Территория",
          type: "select",
          required: true,
          options: [
            { value: "spb", label: "Санкт-Петербург" },
            { value: "lo", label: "Ленинградская область" },
          ],
        },
      ],
      columns: [
        { key: "id", label: "ID" },
        { key: "name", label: "Название" },
        { key: "region", label: "Территория" },
      ],
      rows: data.value?.districts.map((row) => ({ ...row })) ?? [],
    },
    records: {
      fields: [
        {
          key: "playerId",
          label: "Игрок",
          type: "select",
          valueType: "number",
          required: true,
          options: playerOptions.value,
        },
        {
          key: "levelId",
          label: "Уровень",
          type: "select",
          valueType: "number",
          required: true,
          options: levelOptions.value,
        },
        {
          key: "manualPercent",
          label: "Результат, %",
          type: "number",
          help: "100 — прохождение. Пусто — только результат из глобала.",
        },
        { key: "manualVideo", label: "Ссылка на видео" },
        { key: "achievedAt", label: "Дата достижения", type: "date" },
        {
          key: "active",
          label: "Учитывать рекорд",
          type: "checkbox",
          default: true,
        },
        {
          key: "reviewNeeded",
          label: "Нужна проверка после исчезновения из глобала",
          type: "checkbox",
        },
        {
          key: "discardImported",
          label: "Убрать сохранённый результат из глобала",
          type: "checkbox",
          help: "Для исправления исчезнувшего или пониженного рекорда. Актуальный принятый результат может вернуться при следующем импорте.",
        },
        { key: "isFirstRk", label: "Первый РК виктор", type: "checkbox" },
        {
          key: "isFirstSpb",
          label: "Первый СПб виктор",
          type: "checkbox",
          visibleWhen: { key: "playerId", values: regionPlayers("spb") },
          help: "Ручная отметка первого виктора имеет приоритет над датами прохождений.",
        },
        {
          key: "isFirstLo",
          label: "Первый ЛО виктор",
          type: "checkbox",
          visibleWhen: { key: "playerId", values: regionPlayers("lo") },
          help: "Ручная отметка первого виктора имеет приоритет над датами прохождений.",
        },
      ],
      columns: [
        { key: "id", label: "ID" },
        { key: "playerName", label: "Игрок" },
        { key: "levelName", label: "Уровень" },
        { key: "manualPercent", label: "Вручную %" },
        { key: "importedPercent", label: "Глобал %" },
        { key: "active", label: "Активен" },
        { key: "reviewNeeded", label: "Проверка" },
      ],
      rows:
        data.value?.records.map((r) => ({
          ...r,
          playerName: data.value?.players.find((p) => p.id === r.playerId)
            ?.name,
          levelName: data.value?.levels.find((l) => l.id === r.levelId)?.name,
        })) ?? [],
    },
    extras: {
      fields: [
        {
          key: "districtId",
          label: "Район",
          type: "select",
          valueType: "number",
          required: true,
          options: districtOptions.value,
        },
        {
          key: "levelId",
          label: "Пройденный уровень",
          type: "select",
          valueType: "number",
          required: true,
          options: levelOptions.value,
        },
        { key: "achievedAt", label: "Дата достижения", type: "date" },
        { key: "note", label: "Публичное примечание", type: "textarea" },
      ],
      columns: [
        { key: "id", label: "ID" },
        { key: "districtName", label: "Район" },
        { key: "levelName", label: "Уровень" },
        { key: "note", label: "Примечание" },
      ],
      rows:
        data.value?.extras.map((e) => ({
          ...e,
          districtName: data.value?.districts.find((d) => d.id === e.districtId)
            ?.name,
          levelName: data.value?.levels.find((l) => l.id === e.levelId)?.name,
        })) ?? [],
    },
    accounts: {
      fields: [
        { key: "login", label: "Логин", required: true },
        { key: "nickname", label: "Отображаемый ник" },
        {
          key: "playerId",
          label: "Профиль игрока",
          type: "select",
          nullable: true,
          valueType: "number",
          options: playerOptions.value,
          help: "Выберите профиль с достижениями этого игрока. Пустое значение снимает привязку, сохраняя профиль и все его рекорды.",
        },
        { key: "headAdmin", label: "Главный администратор", type: "checkbox" },
        {
          key: "avatarLocked",
          label: "Запретить пользователю менять аватар",
          type: "checkbox",
        },
        {
          key: "unlinkDiscord",
          label: "Отвязать потерянный Discord",
          type: "checkbox",
        },
        {
          key: "transferHeadAdminTo",
          label: "Передать права главного администратора",
          type: "select",
          nullable: true,
          valueType: "number",
          options:
            data.value?.accounts
              .filter((a) => !a.disabled)
              .map((a) => ({
                value: a.id,
                label: `${a.displayName} · ID ${a.id}`,
              })) ?? [],
          help: "Выбранный аккаунт получит права, а текущий их передаст. Для второго главного администратора включи флажок в его аккаунте.",
        },

        {
          key: "avatarUrl",
          label: "Аватар аккаунта",
          type: "image",
          help: "Изображение, назначенное администрацией, имеет приоритет перед Discord и Google. Пустое поле возвращает автоматический выбор.",
        },
        {
          key: "permissions",
          label: "Разрешения",
          type: "permissions",
          options: PERMISSIONS.map((p) => ({
            value: p,
            label: permissionLabels[p],
          })),
        },
        { key: "disabled", label: "Аккаунт отключён", type: "checkbox" },
      ],
      columns: [
        { key: "id", label: "ID" },
        { key: "displayName", label: "Ник" },
        { key: "login", label: "Логин" },
        { key: "playerName", label: "Профиль игрока" },
        { key: "headAdmin", label: "Главный администратор" },
        { key: "permissions", label: "Разрешения" },
        { key: "disabled", label: "Отключён" },
      ],
      rows: data.value?.accounts ?? [],
      create: false,
    },
    news: {
      fields: [
        {
          key: "title",
          label: "Текст новости",
          type: "textarea",
          required: true,
        },
      ],
      columns: [
        { key: "id", label: "ID" },
        { key: "title", label: "Новость" },
        { key: "createdAt", label: "Дата" },
      ],
      rows: data.value?.news ?? [],
    },
  }));
}
