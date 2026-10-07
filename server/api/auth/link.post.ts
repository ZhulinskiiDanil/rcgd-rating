export default defineEventHandler(() => {
  throw createError({
    statusCode: 410,
    message:
      "Используйте логин и пароль. Привязку сервисов изменяет администрация.",
  });
});
