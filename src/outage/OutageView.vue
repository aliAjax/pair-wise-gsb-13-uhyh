<script setup lang="ts">
/**
 * 停电应急加油台 —— 页面总装
 * 仅负责按停电阶段分区展示，业务判定全部在 store/rules 中。
 */
import { computed, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useOutageStore } from "./store";
import OutageRegister from "./components/OutageRegister.vue";
import OutageStatus from "./components/OutageStatus.vue";
import ManualEntryForm from "./components/ManualEntryForm.vue";
import EntryList from "./components/EntryList.vue";
import ReceiptPanel from "./components/ReceiptPanel.vue";
import ShiftPanel from "./components/ShiftPanel.vue";
import CorrectionLog from "./components/CorrectionLog.vue";

const store = useOutageStore();
const operatorInput = ref(store.state.operator);

const phase = computed(() => store.outage?.phase ?? null);
const s = computed(() => store.summary);

function saveOperator() {
  if (!operatorInput.value.trim()) {
    ElMessage.error("请填写值班员姓名");
    return;
  }
  store.setOperator(operatorInput.value);
  ElMessage.success("值班员已更新");
}

async function resetDemo() {
  try {
    await ElMessageBox.confirm("将清空本地数据并恢复演示数据，确定继续？", "重置演示", {
      type: "warning"
    });
  } catch {
    return;
  }
  store.resetDemo();
  operatorInput.value = store.state.operator;
  ElMessage.success("已重置为演示数据");
}

const metricCards = computed(() => [
  { label: "纸单总数", value: s.value.total, tone: "default" },
  { label: "待补录", value: s.value.pendingSupplement, tone: s.value.pendingSupplement ? "warning" : "default" },
  { label: "待核销", value: s.value.pendingReconcile + s.value.mismatch, tone: s.value.pendingReconcile + s.value.mismatch ? "primary" : "default" },
  { label: "已核销", value: s.value.reconciled, tone: "success" },
  { label: "已核销升数", value: `${s.value.reconciledLiters.toFixed(1)} L`, tone: "default" },
  { label: "已核销金额", value: `${s.value.reconciledAmount.toFixed(2)} 元`, tone: "default" },
  { label: "待匹配小票", value: s.value.receiptsPending, tone: s.value.receiptsPending ? "warning" : "default" }
]);
</script>

<template>
  <main class="outage-app">
    <div class="outage-shell">
      <header class="hero">
        <div>
          <p class="eyebrow">石油 · 加油站班次交接 / 停电应急</p>
          <h1>台风夜停电应急加油台</h1>
          <p class="lead">
            停电期间凭纸单手工加油；复电后逐单匹配终端小票，金额不符不得核销；
            设备自检与油枪复位双通过才恢复营业，确认即冻结，更正另建原因版本；未处理完不能关班，可写原因交班承接。
          </p>
        </div>
        <div class="operator-box">
          <el-input v-model="operatorInput" placeholder="值班员姓名" class="op-input" />
          <el-button type="primary" @click="saveOperator">切换值班员</el-button>
          <el-button text type="info" @click="resetDemo">重置演示数据</el-button>
        </div>
      </header>

      <section class="metric-grid">
        <article v-for="m in metricCards" :key="m.label" class="metric" :class="`tone-${m.tone}`">
          <span>{{ m.label }}</span>
          <strong>{{ m.value }}</strong>
        </article>
      </section>

      <!-- 未登记停电事件 -->
      <section v-if="!store.outage" class="grid-2">
        <OutageRegister />
        <ShiftPanel />
      </section>

      <!-- 已登记 -->
      <template v-else>
        <section class="grid-2 top">
          <OutageStatus />
          <ShiftPanel />
        </section>

        <!-- 停电中：手工加油 -->
        <section v-if="phase === 'ACTIVE'" class="grid-2">
          <ManualEntryForm />
          <EntryList />
        </section>

        <!-- 已复电：小票匹配核销 + 双检 -->
        <section v-else-if="phase === 'POWER_RESTORED'" class="grid-2">
          <ReceiptPanel />
          <EntryList />
        </section>

        <!-- 已恢复冻结：只读核对 + 原因版本 -->
        <section v-else class="grid-2">
          <EntryList />
          <CorrectionLog />
        </section>
      </template>

      <footer class="foot">
        数据仅保存在本机浏览器 localStorage · 判定规则集中在 rules.ts，持久化集中在 storage.ts，页面组件不直接改写存储
      </footer>
    </div>
  </main>
</template>

<style scoped>
.outage-app { padding: 26px 28px 40px; }
.outage-shell { max-width: 1240px; margin: 0 auto; }
.hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 18px;
}
.eyebrow { margin: 0 0 6px; color: #176b87; font-weight: 700; font-size: 13px; }
h1 { margin: 0; font-size: clamp(24px, 3vw, 34px); }
.lead { margin: 10px 0 0; max-width: 780px; color: #5b667a; line-height: 1.7; font-size: 14px; }
.operator-box {
  display: grid;
  gap: 8px;
  min-width: 220px;
  background: #fff;
  border: 1px solid #dfe7f1;
  border-radius: 10px;
  padding: 12px;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.metric {
  background: #fff;
  border: 1px solid #dfe7f1;
  border-radius: 10px;
  padding: 12px 14px;
}
.metric span { display: block; color: #69758c; font-size: 12px; }
.metric strong { display: block; margin-top: 6px; font-size: 24px; }
.tone-warning strong { color: #b88218; }
.tone-primary strong { color: #176b87; }
.tone-success strong { color: #16834c; }
.grid-2 {
  display: grid;
  grid-template-columns: minmax(340px, 5fr) minmax(420px, 7fr);
  gap: 14px;
  align-items: start;
}
.grid-2.top { margin-bottom: 14px; }
.foot {
  margin-top: 22px;
  color: #97a0b3;
  font-size: 12px;
  text-align: center;
}
:deep(.panel-card) { border-radius: 10px; }
:deep(.card-title) { font-weight: 700; font-size: 16px; }

@media (max-width: 1020px) {
  .metric-grid { grid-template-columns: repeat(3, 1fr); }
  .grid-2 { grid-template-columns: 1fr; }
  .hero { flex-direction: column; }
}
</style>
