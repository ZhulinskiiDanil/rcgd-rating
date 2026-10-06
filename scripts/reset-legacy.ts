import { resetLegacy } from "../server/services/legacy";
console.log(
  `Из Legacy убрано уровней: ${resetLegacy()}. Карточки уровней и персональные рекорды сохранены.`,
);
