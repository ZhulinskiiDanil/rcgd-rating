<script setup lang="ts">
import { formatPosition } from "#shared/utils/presentation";
import { progressPosition, WEIGHTS } from "#shared/utils/rating";
const examplePlace = ref(12),
  exampleProgress = ref(75);
const exampleResult = computed(() => {
  const position = Number(examplePlace.value);
  if (!Number.isFinite(position) || position < 1 || position > 150) return null;
  return progressPosition(position, Number(exampleProgress.value), 50, 98);
});
useHead({ title: "Как считается рейтинг · СПб Demonlist" });
</script>
<template>
  <article class="rules-page">
    <header class="page-heading">
      <div>
        <h1>Как считается рейтинг</h1>
        <p class="page-intro">
          Рейтинг сделан на основе GD Stats by Lev. Шесть сильнейших результатов
          — одна формула для всего региона.
        </p>
      </div>
    </header>
    <div class="rules-layout">
      <nav class="rules-nav" aria-label="Разделы правил">
        <a href="#players"><AppIcon name="users" />Игроки</a
        ><a href="#progress"><AppIcon name="trophy" />Прогрессы</a
        ><a href="#districts"><AppIcon name="map" />Районы</a
        ><a href="#sources"><AppIcon name="globe" />Источники</a
        ><a href="#legacy"><AppIcon name="archive" />Legacy и история</a>
      </nav>
      <div class="rules-content">
        <section id="players" class="rule-section">
          <h2>Рейтинг игроков</h2>
          <p>
            Каждое прохождение получает позицию уровня в СПб-листе. Чем сложнее
            уровень, тем меньше его номер и тем сильнее результат. Из достижений
            игрока выбираются шесть лучших.
          </p>
          <div class="weights-panel">
            <h3>Вес каждого хардеста</h3>
            <div class="weights">
              <div v-for="(weight, i) in WEIGHTS" :key="weight">
                <span>{{ i + 1 }}-й</span
                ><strong>{{ weight }}<small>/42</small></strong
                ><span
                  class="weight-bar"
                  :style="{ height: weight * 4 + 'px' }"
                />
              </div>
            </div>
          </div>
          <p>
            Шесть наименьших условных позиций умножаются на свои веса и
            суммируются. Для каждого уровня берётся только лучший результат:
            прохождение заменяет прогресс.
          </p>
          <div class="rule-callout">
            <AppIcon name="check" />
            <p>
              <strong>Меньше балл — выше место.</strong> Одинаковый балл даёт
              одинаковое место. Пустой слот равен 150; результат хуже 150 не
              заменяет пустой слот.
            </p>
          </div>
        </section>
        <section id="progress" class="rule-section">
          <h2>Как учитываются прогрессы</h2>
          <p>
            Прогресс получает условную позицию и может занять любое из шести
            мест в наборе игрока. Для расчёта берётся место h, на которое
            уровень встал бы среди всех пройденных в Петербурге и области. До
            первого прохождения уровень не появляется в основном листе.
          </p>
          <div class="formula">
            <code>f = h × 2 × (T / c)<sup>ln(2) / ln(T / t)</sup></code>
          </div>
          <dl class="formula-legend">
            <div>
              <dt>h</dt>
              <dd>Место уровня в СПб-листе, если бы он был пройден</dd>
            </div>
            <div>
              <dt>c</dt>
              <dd>Процент прогресса игрока</dd>
            </div>
            <div>
              <dt>t</dt>
              <dd>Минимальный лист-процент</dd>
            </div>
            <div>
              <dt>T</dt>
              <dd>Конец уровня: последняя возможность умереть</dd>
            </div>
          </dl>
          <p>
            Лист-процент и процент конца уровня берутся из топа-150 Coreboard.
            Сам уровень также должен находиться в текущем глобальном топе-150
            Demonlist. Прогресс ниже t не учитывается, а c выше T ограничивается
            значением T.
          </p>
          <div class="example-panel panel">
            <div class="example-heading">
              <h3>Попробуйте формулу</h3>
              <span>Пример с t = 50%, T = 98%</span>
            </div>
            <div class="example-controls">
              <label
                >Место уровня h<input
                  v-model.number="examplePlace"
                  type="number"
                  min="1"
                  max="150"
                  step="1" /></label
              ><label class="progress-control"
                ><span
                  >Прогресс c <strong>{{ exampleProgress }}%</strong></span
                ><input
                  v-model.number="exampleProgress"
                  type="range"
                  min="50"
                  max="98"
                  step="1"
                /><span class="range-endpoints"
                  ><span>50%</span><span>98%</span></span
                ></label
              >
              <div class="example-result" aria-live="polite">
                <span>Условная позиция</span
                ><strong>{{
                  exampleResult === null ? "—" : formatPosition(exampleResult)
                }}</strong>
              </div>
            </div>
            <p v-if="exampleResult === null">
              Введите место от 1 до 150. Результат выше 150 не входит в шестёрку
              лучших.
            </p>
            <p v-else>
              Эта позиция сравнивается с остальными результатами игрока. Чем
              ближе прогресс к эндингу, тем сильнее результат.
            </p>
          </div>
        </section>
        <section id="districts" class="rule-section">
          <h2>Рейтинг районов</h2>
          <p>
            В зачёт идут шесть самых сложных уникальных прохождений игроков
            района и достижения, отдельно добавленные администрацией. Повторные
            прохождения одного уровня считаются один раз. Прогрессы не
            учитываются.
          </p>
          <p>
            Веса и пустые слоты такие же, как у игроков. Достижения за пределами
            местного топа-150 остаются в карточке района, но не улучшают балл.
          </p>
          <p>
            У игрока один район. При его смене все прохождения переходят в зачёт
            нового района.
          </p>
        </section>
        <section id="sources" class="rule-section">
          <h2>Источники и обновления</h2>
          <div class="source-links">
            <a
              href="https://demonlist.org/api-docs"
              target="_blank"
              rel="noopener noreferrer"
              ><span
                ><strong>Global Demonlist</strong
                ><small>Глобальные позиции и принятые рекорды</small></span
              ><AppIcon name="external" /></a
            ><a
              href="https://coreboard.pythonanywhere.com/main/levels"
              target="_blank"
              rel="noopener noreferrer"
              ><span
                ><strong>Coreboard</strong
                ><small>Лист-проценты и эндинги топа-150</small></span
              ><AppIcon name="external" /></a
            ><a
              href="https://docs.google.com/spreadsheets/d/1vSOs24s1nX9hWiwoy8qWSWh28CUKODectnBz14Vpx5M/edit?gid=626858444"
              target="_blank"
              rel="noopener noreferrer"
              ><span
                ><strong>Таблица сообщества</strong
                ><small>Начальный СПб-лист и достижения</small></span
              ><AppIcon name="external"
            /></a>
          </div>
          <p>
            Принятые рекорды привязанных глобальных профилей импортируются
            автоматически. Администрация также может принимать результаты
            самостоятельно.
          </p>
          <p>
            Если рекорд исчез из глобала, он сохраняется в расчёте с отметкой до
            решения администрации. При сбое источника остаются последние успешно
            загруженные данные.
          </p>
        </section>
        <section id="legacy" class="rule-section">
          <h2>Legacy и история</h2>
          <p>
            <NuxtLink to="/demonlist?list=legacy">Legacy list</NuxtLink> хранит
            уровни, покинувшие местный топ-150. Дата вылета — момент, когда сайт
            обнаружил изменение, а не восстановленная историческая дата.
          </p>
          <p>
            В <NuxtLink to="/changelog">истории изменений</NuxtLink> сохраняются
            постановки и перестановки уровней, переходы между Main list (1–75),
            Extended list (76–150) и Legacy list, а также изменения мест игроков
            и районов. Изменение только балла не создаёт событие. Новые рекорды
            на Legacy-уровнях больше не принимаются.
          </p>
        </section>
      </div>
    </div>
  </article>
</template>
<style scoped lang="scss">
.page-heading h1 {
  margin-bottom: 13px;
}
.rules-layout {
  display: grid;
  grid-template-columns: 205px minmax(0, 790px);
  gap: 50px;
  margin-top: 40px;
}
.rules-nav {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-self: start;
  position: sticky;
  top: 100px;
  border-left: 1px solid var(--line);
  a {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted);
    font-size: 14px;
    padding: 11px 17px;
    text-decoration: none;
    &:hover {
      color: var(--accent);
    }
    svg {
      width: 15px;
      height: 15px;
    }
  }
}
.rules-content {
  min-width: 0;
}
.rule-section {
  padding-bottom: 36px;
  margin-bottom: 34px;
  border-bottom: 1px solid var(--line);
  scroll-margin-top: 100px;
  &:last-child {
    border: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }
  h2 {
    font-size: 26px;
    margin: 0 0 20px;
  }
  > p {
    font-size: 16px;
    color: var(--muted);
    line-height: 1.9;
    margin: 16px 0;
  }
}
.weights-panel {
  margin: 26px 0;
  h3 {
    font-size: 16px;
    font-weight: 500;
    color: var(--muted);
    margin: 0 0 20px;
  }
}
.weights {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  border-bottom: 1px solid var(--line);
  > div {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-end;
    min-height: 106px;
    > span:first-child {
      font-size: 14px;
      color: var(--muted);
      margin-bottom: 9px;
    }
    strong {
      font-size: 21px;
      font-weight: 500;
      margin-bottom: auto;
      padding-bottom: 14px;
    }
    small {
      font-size: 14px;
      font-weight: 400;
      color: var(--muted);
    }
  }
}
.weight-bar {
  width: 100%;
  max-width: 65px;
  background: var(--accent-soft);
  border-top: 2px solid var(--accent);
  border-radius: 4px 4px 0 0;
}
.rule-callout {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  padding: 18px 20px;
  margin-top: 24px;
  background: var(--accent-soft);
  border-left: 2px solid var(--accent);
  > svg {
    color: var(--accent);
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    margin-top: 2px;
  }
  p {
    font-size: 14px;
    color: var(--muted);
    line-height: 1.8;
    margin: 0;
  }
  strong {
    color: var(--text);
    font-weight: 500;
  }
}
.formula {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 26px;
  margin: 26px 0;
  overflow-x: auto;
  code {
    background: none;
    padding: 0;
    border-radius: 0;
    font-family: "Golos Text", sans-serif;
    font-size: clamp(17px, 2vw, 24px);
    white-space: nowrap;
    color: var(--accent);
  }
  sup {
    font-size: 14px;
    padding-left: 4px;
  }
}
.formula-legend {
  margin: 20px 0 24px;
  display: grid;
  gap: 13px;
  div {
    display: flex;
    align-items: baseline;
    gap: 18px;
    font-size: 14px;
  }
  dt {
    color: var(--accent);
    font-weight: 600;
    width: 10px;
    flex-shrink: 0;
  }
  dd {
    margin: 0;
    color: var(--muted);
    line-height: 1.65;
  }
}
.example-panel {
  padding: 24px;
  margin-top: 25px;
  > p {
    margin: 20px 0 0;
    font-size: 14px;
    color: var(--muted);
    line-height: 1.7;
  }
}
.example-heading {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  h3 {
    font-size: 14px;
    font-weight: 500;
    margin: 0;
  }
  > span {
    font-size: 14px;
    color: var(--muted);
  }
}
.example-controls {
  display: grid;
  grid-template-columns: 110px minmax(100px, 1fr) 130px;
  gap: 26px;
  align-items: start;
  label {
    display: flex;
    flex-direction: column;
    gap: 9px;
    color: var(--muted);
    font-size: 14px;
  }
  input[type="number"] {
    width: 100%;
    font-size: 16px;
    padding: 9px 12px;
  }
}
.progress-control {
  > span:first-child {
    display: flex;
    align-items: center;
    justify-content: space-between;
    strong {
      font-size: 15px;
      color: var(--text);
      font-weight: 500;
    }
  }
  input[type="range"] {
    width: 100%;
    accent-color: var(--accent);
    padding: 0;
    height: 22px;
    cursor: pointer;
    background: transparent;
  }
  .range-endpoints {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    margin-top: -5px;
  }
}
.example-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-left: 1px solid var(--line);
  padding-left: 24px;
  span {
    font-size: 14px;
    color: var(--muted);
  }
  strong {
    color: var(--accent);
    font-size: 26px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
}
.source-links {
  margin: 24px 0;
  border-top: 1px solid var(--line);
  a {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    padding: 18px 0;
    border-bottom: 1px solid var(--line);
    text-decoration: none;
    span {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    strong {
      font-size: 15px;
      font-weight: 500;
      color: var(--text);
    }
    small {
      font-size: 14px;
      color: var(--muted);
    }
    svg {
      width: 15px;
      height: 15px;
    }
    &:hover strong {
      color: var(--accent);
    }
  }
}
@media (max-width: 900px) {
  .rules-layout {
    grid-template-columns: 1fr;
    gap: 25px;
  }
  .rules-nav {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
    border-left: 0;
    border-bottom: 1px solid var(--line);
    padding-bottom: 20px;
    gap: 10px;
    a {
      padding: 7px 10px 7px 0;
    }
  }
}
@media (max-width: 550px) {
  .rule-section h2 {
    font-size: 22px;
  }
  .example-panel {
    padding: 20px;
  }
  .example-controls {
    grid-template-columns: 90px 1fr;
    gap: 20px;
  }
  .example-result {
    grid-column: 1 / -1;
    border-left: 0;
    padding-left: 0;
    border-top: 1px solid var(--line);
    padding-top: 18px;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .weights {
    gap: 8px;
    > div strong {
      font-size: 19px;
    }
  }
  .formula {
    padding: 20px 16px;
  }
}
</style>
