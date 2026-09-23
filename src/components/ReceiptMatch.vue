<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useDeskStore } from "../store/desk";
import { effectiveRecord } from "../domain/rules";

const store = useDeskStore();

const visible = computed(() => {
  const stage = store.activeEvent?.stage;
  return stage === "已复电" || stage === "已恢复营业";
});

/* 单张小票录入 */
const blank = () => ({ slipNo: "", plateTail: "", nozzle: "", liters: null as number | null, amount: null as number | null, paidAt: "" });
const form = reactive(blank());
const feedback = ref("");

function addOne() {
  if (!form.slipNo || form.liters === null || form.amount === null) {
    feedback.value = "单号、升数、金额为必填";
    return;
  }
  const res = store.addReceipt({
    slipNo: form.slipNo.trim(),
    plateTail: form.plateTail.trim().toUpperCase(),
    nozzle: form.nozzle,
    liters: Number(form.liters),
    amount: Number(form.amount),
    paidAt: form.paidAt || new Date().toISOString()
  });
  feedback.value = res.ok ? "小票已导入并完成匹配" : res.message ?? "导入失败";
  if (res.ok) Object.assign(form, blank());
}

/* 批量粘贴：每行 单号,车牌后三位,枪号,升数,金额 */
const bulkText = ref("");
const bulkMsg = ref("");
function importBulk() {
  bulkMsg.value = "";
  const rows = bulkText.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [slipNo, plateTail, nozzle, liters, amount] = line.split(/[,，\s]+/);
      return {
        slipNo: (slipNo ?? "").trim(),
        plateTail: (plateTail ?? "").trim().toUpperCase(),
        nozzle: (nozzle ?? "").trim(),
        liters: Number(liters),
        amount: Number(amount),
        paidAt: new Date().toISOString()
      };
    })
    .filter((r) => r.slipNo && Number.isFinite(r.amount));
  if (rows.length === 0) {
    bulkMsg.value = "未解析到有效行，格式：单号,车牌后三位,枪号,升数,金额";
    return;
  }
  const n = store.importReceipts(rows);
  bulkMsg.value = `导入 ${n} 张小票，已重新匹配`;
  bulkText.value = "";
}

const unmatchedReceipts = computed(
  () => store.activeEvent?.receipts.filter((r) => !r.matched) ?? []
);

const rows = computed(() => {
  const event = store.activeEvent;
  if (!event) return [];
  return event.records
    .map((r) => ({ raw: r, eff: effectiveRecord(r) }))
    .filter(({ eff }) => eff.status !== "待补录")
    .sort((a, b) => new Date(b.raw.createdAt).getTime() - new Date(a.raw.createdAt).getTime());
});
</script>

<template>
  <section v-if="visible && store.activeEvent" class="panel">
    <div class="head">
      <h2>复电后终端小票匹配</h2>
      <button type="button" class="secondary" @click="store.runMatching()">重新全量匹配</button>
    </div>
    <p class="rule">
      按纸单号匹配终端小票；<b>金额一致才核销，金额不符保持挂起、禁止核销</b>。
    </p>

    <form v-if="!store.frozen" class="form-grid" @submit.prevent="addOne">
      <div class="row">
        <label>小票单号<input v-model="form.slipNo" placeholder="如 Z005" /></label>
        <label>车牌后三位<input v-model="form.plateTail" maxlength="3" /></label>
      </div>
      <div class="row">
        <label>枪号<input v-model="form.nozzle" /></label>
        <label>升数<input v-model.number="form.liters" type="number" step="0.01" /></label>
      </div>
      <div class="row">
        <label>终端金额（元）<input v-model.number="form.amount" type="number" step="0.01" /></label>
        <label>交易时间<input v-model="form.paidAt" type="datetime-local" /></label>
      </div>
      <button type="submit">导入小票并匹配</button>
      <p v-if="feedback" class="fb">{{ feedback }}</p>
    </form>

    <div v-if="!store.frozen" class="bulk">
      <p class="rule">或批量粘贴终端导出（每行：单号,车牌后三位,枪号,升数,金额）：</p>
      <textarea v-model="bulkText" rows="3" placeholder="Z005,7K2,1,30,237&#10;Z006,M19,2,40,316"></textarea>
      <button type="button" class="secondary" @click="importBulk">批量导入</button>
      <p v-if="bulkMsg" class="fb">{{ bulkMsg }}</p>
    </div>

    <div class="match-table">
      <table>
        <thead>
          <tr>
            <th>纸单号</th><th>车牌</th><th>枪号</th><th>升数</th>
            <th>纸单金额</th><th>终端金额</th><th>核销结果</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="{ raw, eff } in rows" :key="raw.id" :class="`row-${eff.status}`">
            <td>{{ eff.slipNo }}</td>
            <td>{{ eff.plateTail }}</td>
            <td>{{ eff.nozzle }}</td>
            <td>{{ eff.liters.toFixed(2) }}</td>
            <td>¥{{ eff.amount.toFixed(2) }}</td>
            <td>
              {{ raw.matchedReceipt ? `¥${store.activeEvent.receipts.find((x) => x.slipNo === raw.matchedReceipt)?.amount.toFixed(2)}` : "—" }}
            </td>
            <td>
              <span class="badge" :class="`b-${eff.status}`">{{ eff.status }}</span>
              <small v-if="raw.diffNote" class="diff">{{ raw.diffNote }}</small>
            </td>
          </tr>
          <tr v-if="rows.length === 0"><td colspan="7" class="empty">暂无可匹配纸单（待补录单补录后自动进入）</td></tr>
        </tbody>
      </table>
    </div>

    <details v-if="unmatchedReceipts.length" class="unmatched">
      <summary>终端有、纸单无的小票（{{ unmatchedReceipts.length }} 张，点击展开）</summary>
      <ul>
        <li v-for="rc in unmatchedReceipts" :key="rc.slipNo">
          {{ rc.slipNo }} · {{ rc.plateTail }} · {{ rc.nozzle }} 号枪 · ¥{{ rc.amount.toFixed(2) }}
        </li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
h2 { margin: 0; }
.rule { color: #69758c; font-size: 13px; margin: 8px 0; }
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.fb { color: #14724f; font-size: 13px; margin: 4px 0; }
.bulk {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #d9e2ee;
  display: grid;
  gap: 8px;
}
.bulk button { justify-self: start; }
.match-table {
  margin-top: 14px;
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th, td {
  border: 1px solid #e3e9f2;
  padding: 8px 10px;
  text-align: left;
  white-space: nowrap;
}
th { background: #f6f8fb; color: #445069; }
.row-金额不符 { background: #fff8f0; }
.row-已核销 { background: #f4fbf7; }
.badge {
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 12px;
}
.b-已核销 { background: #e8f4ef; color: #14724f; }
.b-金额不符 { background: #fdecea; color: #b3261e; }
.b-无小票 { background: #f3f0ff; color: #5b3db3; }
.b-待匹配 { background: #e8f0fe; color: #1a56c8; }
.diff { display: block; color: #b35a00; margin-top: 4px; white-space: normal; }
.empty { text-align: center; color: #69758c; }
.unmatched {
  margin-top: 12px;
  font-size: 13px;
  color: #5b3db3;
}
.unmatched ul { margin: 8px 0 0; padding-left: 20px; }
</style>
