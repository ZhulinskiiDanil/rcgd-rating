<script setup lang="ts">
import type { Level } from "#shared/types/domain";
import type { RegionalFirstVictor } from "#shared/utils/victors";
const props = defineProps<{
  levels: Level[];
  victors?: Record<number, RegionalFirstVictor[]>;
}>();
const featured = computed(() => props.levels[0]);
const runners = computed(() => props.levels.slice(1, 3));
</script>
<template>
  <div class="intro">
    <img
      class="city-image"
      src="/images/white-nights-neva.png"
      alt=""
      fetchpriority="high"
    />
    <div class="intro-copy">
      <span class="eyebrow">Санкт-Петербург · Ленинградская область</span>
      <h1>Демонлист<br />Санкт-Петербурга</h1>
      <p>
        Самые сложные уровни, пройденные<br class="wide-break" />
        игроками нашего города и области.
      </p>
    </div>
    <NuxtLink to="/demonlist" class="jump-link"
      >Смотреть лист <AppIcon name="arrow" :size="18"
    /></NuxtLink>
  </div>
  <div v-if="featured" class="highlights" aria-label="Три сложнейших уровня">
    <div class="highlight-card">
      <NuxtLink :to="`/levels/${featured.id}`" class="spotlight">
        <LevelArtwork :level="featured" eager />
        <div class="spotlight-shade"></div>
        <span class="spotlight-rank">#1</span>
        <div class="spotlight-copy">
          <span class="spotlight-label"
            ><AppIcon name="trophy" :size="18" /> Самый сложный в
            Петербурге</span
          >
          <h2>{{ featured.name }}</h2>
          <p>
            {{ featured.creator || "Автор не указан"
            }}<span v-if="featured.globalRank"
              ><AppIcon name="globe" :size="16" /> #{{ featured.globalRank }} в
              Global Demonlist</span
            >
          </p>
          <div class="featured-victors">
            <span
              v-for="row in (victors?.[featured.id] ?? []).filter(
                (r) => r.victors.length,
              )"
              :key="row.region"
              >{{ row.region === "spb" ? "СПб" : "ЛО" }} ·
              {{ row.victors.map((v) => v.name).join(", ") }}</span
            >
          </div>
          <span class="spotlight-action"
            >Открыть уровень <AppIcon name="chevron" :size="17"
          /></span>
        </div>
        <span class="art-caption">{{ featured.name }} / #1 СПб</span>
      </NuxtLink>
      <div class="highlight-edit">
        <EntityEditButton
          resource="levels"
          :entity-id="featured.id"
          :label="`Редактировать уровень ${featured.name}`"
          compact
        />
      </div>
    </div>
    <div v-if="runners.length" class="runner-grid">
      <div v-for="level in runners" :key="level.id" class="highlight-card">
        <NuxtLink :to="`/levels/${level.id}`" class="runner">
          <span class="runner-rank">#{{ level.localRank }}</span>
          <span class="runner-copy"
            ><strong>{{ level.name }}</strong
            ><span>{{ level.creator || "Автор не указан" }}</span
            ><small v-if="level.globalRank"
              ><AppIcon name="globe" :size="14" /> #{{ level.globalRank }} в
              Global Demonlist</small
            ><small
              v-for="row in (victors?.[level.id] ?? []).filter(
                (r) => r.victors.length,
              )"
              :key="row.region"
              class="runner-victor"
              >{{ row.region === "spb" ? "СПб" : "ЛО" }} ·
              {{ row.victors.map((v) => v.name).join(", ") }}</small
            ></span
          >
          <span class="runner-art"><LevelArtwork :level="level" /></span>
          <span class="runner-open"><AppIcon name="chevron" :size="20" /></span>
        </NuxtLink>
        <div class="highlight-edit">
          <EntityEditButton
            resource="levels"
            :entity-id="level.id"
            :label="`Редактировать уровень ${level.name}`"
            compact
          />
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped lang="scss">
.featured-victors {
  display: grid;
  gap: 3px;
  margin-top: 12px;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.runner-copy .runner-victor {
  margin-top: 2px;
  overflow-wrap: anywhere;
}
.highlight-card {
  position: relative;
  min-width: 0;
}
.highlight-edit {
  position: absolute;
  z-index: 3;
  top: 14px;
  right: 14px;
  &:empty {
    display: none;
  }
}
.intro {
  position: relative;
  isolation: isolate;
  min-height: 240px;
  display: flex;
  align-items: center;
  margin: -50px -40px 0;
  padding: 35px 40px 30px;
  overflow: hidden;
}
.city-image {
  position: absolute;
  z-index: -2;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  opacity: var(--hero-opacity);
  filter: var(--hero-filter);
  mask-image: linear-gradient(90deg, transparent 12%, #000 65%);
  pointer-events: none;
}
.intro::after {
  position: absolute;
  inset: 0;
  content: "";
  z-index: -1;
  background: linear-gradient(0deg, var(--bg), transparent 25%);
  pointer-events: none;
}
.intro-copy {
  max-width: 100%;
  position: relative;
}
.eyebrow {
  display: block;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 21px;
}
.intro h1 {
  font-size: clamp(36px, 4.8vw, 64px);
  line-height: 1.025;
  letter-spacing: -0.065em;
  margin-bottom: 22px;
  font-weight: 700;
  overflow-wrap: normal;
}
.intro p {
  font-size: 18px;
  line-height: 1.6;
  color: var(--muted);
  margin: 0;
}
.jump-link {
  position: absolute;
  bottom: 54px;
  right: 40px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--text);
  border-bottom: 1px solid var(--line);
  padding-bottom: 7px;
}
.jump-link svg {
  transform: rotate(90deg);
}
.highlights {
  margin: 7px 0 58px;
}
.spotlight {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 300px;
  padding: 45px 46px;
  overflow: hidden;
  border-radius: var(--radius);
  isolation: isolate;
  color: var(--art-text);
  background: var(--art-bg);
}
.spotlight :deep(.artwork) {
  position: absolute;
  inset: 0;
  z-index: -3;
}
.spotlight :deep(img) {
  object-position: 76% 50%;
}
.spotlight-shade {
  position: absolute;
  inset: 0;
  z-index: -2;
  background: linear-gradient(
    90deg,
    #082565fa 0%,
    #102e73ee 32%,
    #132d6d6b 70%,
    #08142b40 100%
  );
}
.spotlight:hover {
  color: var(--art-text);
}
.spotlight-rank {
  font-weight: 700;
  font-size: 150px;
  letter-spacing: -0.09em;
  line-height: 1;
  flex-shrink: 0;
  padding-right: 46px;
  color: #e4eeff;
}
.spotlight-copy {
  min-width: 0;
}
.spotlight-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #d9e6ff;
}
.spotlight h2 {
  font-size: clamp(35px, 4vw, 60px);
  font-weight: 700;
  letter-spacing: -0.04em;
  margin: 8px 0 6px;
  line-height: 1.1;
  overflow-wrap: anywhere;
}
.spotlight p {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
  font-size: 15px;
  margin: 0;
  color: #d9e6ff;
}
.spotlight p span {
  display: inline-flex;
  gap: 7px;
  align-items: center;
}
.spotlight-action {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: #ffffff17;
  border: 1px solid #ffffff3b;
  border-radius: 9px;
  padding: 10px 15px;
  margin-top: 24px;
  font-size: 13px;
}
.art-caption {
  position: absolute;
  bottom: 24px;
  right: 30px;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: #e7edff;
}
.runner-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
  margin-top: 22px;
}
.runner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 25px;
  min-height: 180px;
  padding: 30px 32px;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.runner-rank {
  font-size: 66px;
  font-weight: 700;
  letter-spacing: -0.07em;
  color: var(--text);
  line-height: 1;
}
.runner-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
  position: relative;
  z-index: 2;
  flex: 1;
}
.runner-copy strong {
  font-size: 23px;
  letter-spacing: -0.035em;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.runner-copy > span {
  font-size: 14px;
  color: var(--muted);
}
.runner-copy small {
  display: flex;
  gap: 7px;
  align-items: center;
  color: var(--muted);
  font-size: 12px;
  margin-top: 8px;
}
.runner-art {
  display: block;
  width: 30%;
  min-width: 80px;
  align-self: stretch;
  margin: -30px -32px -30px 0;
  position: relative;
}
.runner-art::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, var(--surface), transparent 60%);
}
.runner-open {
  position: absolute;
  right: 19px;
  bottom: 17px;
  z-index: 2;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface);
  color: var(--text);
}
@media (min-width: 1600px) {
  .intro {
    min-height: 260px;
  }
  .spotlight {
    min-height: 255px;
  }
}
@media (max-width: 1050px) {
  .intro {
    margin: -36px -28px 0;
    padding: 48px 28px;
    min-height: 255px;
  }
  .intro h1 {
    font-size: 64px;
  }
  .jump-link {
    right: 28px;
    bottom: 40px;
  }
  .spotlight {
    padding: 35px;
  }
  .spotlight-rank {
    font-size: 120px;
    padding-right: 30px;
  }
  .runner {
    padding: 24px;
    gap: 18px;
    min-height: 160px;
  }
  .runner-rank {
    font-size: 52px;
  }
  .runner-copy strong {
    font-size: 20px;
  }
  .runner-art {
    margin: -24px -24px -24px 0;
    width: 23%;
  }
}
@media (max-width: 820px) {
  .intro {
    margin: -30px -20px 0;
    padding: 42px 20px;
    min-height: 255px;
  }
  .intro h1 {
    font-size: clamp(38px, 7.9vw, 64px);
  }
  .intro p {
    font-size: 16px;
  }
  .eyebrow {
    font-size: 10px;
    letter-spacing: 0.08em;
  }
  .jump-link {
    display: none;
  }
  .spotlight {
    min-height: 265px;
    padding: 28px;
  }
  .spotlight-rank {
    font-size: 95px;
    padding-right: 24px;
  }
  .spotlight h2 {
    font-size: 40px;
  }
  .spotlight-label {
    font-size: 12px;
  }
  .spotlight p {
    font-size: 13px;
  }
  .art-caption {
    display: none;
  }
  .runner-grid {
    gap: 14px;
  }
  .runner {
    padding: 22px;
    gap: 16px;
    min-height: 140px;
  }
  .runner-rank {
    font-size: 44px;
  }
  .runner-copy strong {
    font-size: 18px;
  }
  .runner-art {
    display: none;
  }
  .runner-open {
    right: 12px;
    bottom: 12px;
    width: 20px;
    height: 20px;
  }
  .runner-copy > span {
    font-size: 12px;
  }
  .highlights {
    margin-bottom: 40px;
  }
}
@media (max-width: 540px) {
  .intro {
    min-height: 235px;
    padding-top: 32px;
    padding-bottom: 34px;
  }
  .intro h1 {
    font-size: clamp(31px, 8vw, 44px);
    letter-spacing: -0.055em;
  }
  .intro p {
    font-size: 14px;
  }
  .eyebrow {
    max-width: 250px;
    font-size: 9px;
    margin-bottom: 16px;
  }
  .city-image {
    object-position: 68%;
    opacity: calc(var(--hero-opacity) * 0.7);
  }
  .spotlight {
    align-items: flex-start;
    min-height: 270px;
    padding: 25px;
    gap: 18px;
    flex-direction: column;
  }
  .spotlight-rank {
    font-size: 70px;
    padding: 0;
    line-height: 0.85;
  }
  .spotlight h2 {
    font-size: 36px;
  }
  .spotlight-label {
    font-size: 11px;
  }
  .spotlight p {
    font-size: 12px;
    gap: 16px;
  }
  .spotlight-action {
    margin-top: 16px;
    font-size: 12px;
    padding: 8px 12px;
  }
  .spotlight-shade {
    background: linear-gradient(90deg, #092565f5, #132d6d9e 78%, #08142b50);
  }
  .runner-grid {
    grid-template-columns: 1fr;
    gap: 12px;
    margin-top: 12px;
  }
  .runner {
    min-height: 115px;
    padding: 20px 24px;
    gap: 22px;
  }
  .runner-rank {
    font-size: 48px;
  }
  .runner-copy strong {
    font-size: 20px;
  }
  .runner-copy small {
    margin-top: 2px;
  }
  .runner-art {
    display: block;
    margin: -20px -24px -20px 0;
    width: 30%;
    min-width: 60px;
  }
  .highlights {
    margin-top: 0;
  }
}
@media (max-width: 400px) {
  .intro {
    margin-inline: -16px;
    padding-inline: 16px;
  }
  .spotlight {
    padding: 22px;
  }
  .runner {
    padding-inline: 20px;
  }
  .runner-rank {
    font-size: 42px;
  }
  .runner-copy strong {
    font-size: 18px;
  }
  .runner-art {
    margin-right: -20px;
  }
  .runner-copy > span {
    font-size: 11px;
  }
}
</style>
