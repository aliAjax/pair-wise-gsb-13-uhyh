<script setup lang="ts">
/**
 * 页面层：只做区块编排与展示。
 * 数据见 src/data，判定见 src/domain，保存见 src/store。
 */
import { computed } from "vue";
import { useDeskStore } from "./store/desk";
import EventSetup from "./components/EventSetup.vue";
import ManualDesk from "./components/ManualDesk.vue";
import ReceiptMatch from "./components/ReceiptMatch.vue";
import RecoveryShift from "./components/RecoveryShift.vue";

const store = useDeskStore();

const metrics = computed(() => {
  const s = store.summary;
  if (!s) return [];
  return [
    { label: "纸单总数", value: s.total },
    { label: "待补录", value: s.pending, warn: s.pending > 0 },
    { label: "已核销", value: s.verified },
    { label: "金额不符(禁核销)", value: s.diff, warn: s.diff > 0 },
    { label: "未闭环", value: store.unfinished.length, warn: store.unfinished.length > 0 },
    { label: "已核销升数(L)", value: s.liters.toFixed(2) },
    { label: "已核销收款(元)", value: `¥${s.cash.toFixed(2)}` }
  ];
});
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 停电应急最小闭环</p>
          <h1>停电应急加油台</h1>
          <p class="subtitle">
            台风夜停电后，纸单手工加油 → 复电后匹配终端小票核销 → 自检复位 → 恢复营业冻结；
            金额不符不得核销，未处理完不能关班，下一班写原因承接，更正另建原因版本。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">TypeScript</span>
          <span class="tag">数据/判定/保存/页面 分层</span>
          <span class="tag">localStorage 留痕</span>
        </div>
      </header>

      <EventSetup />

      <section v-if="store.activeEvent" class="metrics">
        <article v-for="m in metrics" :key="m.label" class="metric" :class="{ alarm: m.warn }">
          <span>{{ m.label }}</span>
          <strong>{{ m.value }}</strong>
        </article>
      </section>

      <div v-if="store.activeEvent" class="workspace">
        <ManualDesk />
        <ReceiptMatch />
        <RecoveryShift />
      </div>

      <footer v-if="store.activeEvent" class="foot">
        <button type="button" class="secondary" @click="store.resetDemo()">重置为演示数据</button>
        <span>数据仅保存在本机浏览器，刷新不丢失。</span>
      </footer>
    </div>
  </main>
</template>

<style scoped>
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
  margin: 18px 0;
}
.metric {
  background: #fff;
  border: 1px solid #dfe7f1;
  border-radius: 8px;
  padding: 14px;
}
.metric.alarm {
  border-color: #e8a49c;
  background: #fff7f6;
}
.metric span {
  display: block;
  color: #69758c;
  font-size: 12px;
}
.metric strong {
  display: block;
  margin-top: 6px;
  font-size: 26px;
}
.metric.alarm strong {
  color: #b3261e;
}
.workspace {
  display: grid;
  gap: 18px;
}
.foot {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 22px;
  color: #98a2b5;
  font-size: 13px;
}
</style>
