<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useDeskStore } from "../store/desk";

const store = useDeskStore();

const visible = computed(() => store.activeEvent?.stage === "已复电");

const selfCheck = reactive({ passed: false, note: "" });
const nozzleReset = reactive({ passed: false, note: "" });
const resumeMsg = ref("");

function confirmResume() {
  store.setSelfCheck(selfCheck.passed, selfCheck.note);
  store.setNozzleReset(nozzleReset.passed, nozzleReset.note);
  const res = store.resumeBusiness();
  resumeMsg.value = res.message ?? "";
}

/* 关班 / 交接 */
const operator = ref("");
const closeMsg = ref("");
const carry = reactive({ shift: "早班", operator: "", reason: "" });
const carryMsg = ref("");

function tryClose() {
  const res = store.attemptCloseShift(operator.value);
  closeMsg.value = res.message;
}

function submitCarry() {
  if (!carry.reason.trim()) {
    carryMsg.value = "承接必须写明原因";
    return;
  }
  store.carryToNextShift({ ...carry });
  carryMsg.value = `已由${carry.shift}承接，继续处理未闭环纸单`;
  carry.reason = "";
}

const handovers = computed(() => [...(store.activeEvent?.handovers ?? [])].reverse());
</script>

<template>
  <section v-if="visible && store.activeEvent" class="panel">
    <h2>设备自检、油枪复位与恢复营业</h2>
    <p class="rule">设备自检和油枪复位<b>双双通过</b>才恢复营业；确认后应急台数据立即冻结。</p>

    <div class="checks">
      <div class="check" :class="{ pass: selfCheck.passed }">
        <label class="check-line">
          <input v-model="selfCheck.passed" type="checkbox" :disabled="store.frozen" />
          <strong>设备自检通过</strong>
        </label>
        <input v-model="selfCheck.note" class="note-input" placeholder="自检说明（项目、结果、检查人）" :disabled="store.frozen" />
      </div>
      <div class="check" :class="{ pass: nozzleReset.passed }">
        <label class="check-line">
          <input v-model="nozzleReset.passed" type="checkbox" :disabled="store.frozen" />
          <strong>油枪复位通过</strong>
        </label>
        <input v-model="nozzleReset.note" class="note-input" placeholder="复位说明（枪号、回零、试机情况）" :disabled="store.frozen" />
      </div>
    </div>

    <button type="button" :disabled="!selfCheck.passed || !nozzleReset.passed || store.frozen" @click="confirmResume">
      双项通过，确认恢复营业并冻结
    </button>
    <p v-if="!selfCheck.passed || !nozzleReset.passed" class="warn">任一项未通过，按钮不可用。</p>
    <p v-if="resumeMsg" class="fb">{{ resumeMsg }}</p>

    <hr />

    <h3>班次交接</h3>
    <p class="rule">
      未处理完（含待补录、待匹配、金额不符、无小票）<b>不能关班</b>；下一班写明原因可承接。
      当前未闭环：<b :class="store.closeAllowed ? 'ok-text' : 'warn-text'">{{ store.unfinished.length }}</b> 单。
    </p>

    <div class="close-row">
      <input v-model="operator" placeholder="本班值班员" />
      <button type="button" :disabled="store.frozen" @click="tryClose">尝试关班</button>
    </div>
    <p v-if="closeMsg" :class="store.closeAllowed ? 'fb' : 'warn'">{{ closeMsg }}</p>

    <div class="carry">
      <div class="row">
        <label>下一班
          <select v-model="carry.shift">
            <option>早班</option><option>中班</option><option>晚班</option><option>夜班</option>
          </select>
        </label>
        <label>接班人
          <input v-model="carry.operator" placeholder="值班员姓名" :disabled="store.frozen" />
        </label>
      </div>
      <label>承接原因（必填）
        <textarea v-model="carry.reason" rows="2" placeholder="如：3 单金额待与终端核对、2 单收款待补，早班继续跟进" :disabled="store.frozen" />
      </label>
      <button type="button" class="secondary" :disabled="store.frozen" @click="submitCarry">下一班承接</button>
      <p v-if="carryMsg" class="fb">{{ carryMsg }}</p>
    </div>

    <ul v-if="handovers.length" class="log">
      <li v-for="h in handovers" :key="h.id">
        <span :class="h.closed ? 'b-ok' : 'b-no'">{{ h.closed ? "已关班" : "未关班/承接" }}</span>
        {{ h.shift }} · {{ h.operator }} · {{ new Date(h.createdAt).toLocaleString("zh-CN") }}
        <em>{{ h.reason }}</em>
      </li>
    </ul>
  </section>
</template>

<style scoped>
h2 { margin: 0 0 6px; }
h3 { margin: 14px 0 4px; }
.rule { color: #69758c; font-size: 13px; margin: 8px 0; }
.checks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.check {
  border: 1px solid #e3e9f2;
  border-radius: 8px;
  padding: 12px;
  display: grid;
  gap: 8px;
  background: #fbfcfe;
}
.check.pass {
  border-color: #8fd4b6;
  background: #f4fbf7;
}
.check-line {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #172033;
}
.check-line input { width: auto; }
.note-input { font-size: 13px; }
.warn { color: #b35a00; font-size: 13px; margin: 8px 0 0; }
.fb { color: #14724f; font-size: 13px; margin: 8px 0 0; }
.ok-text { color: #14724f; }
.warn-text { color: #b3261e; }
hr { border: 0; border-top: 1px solid #e3e9f2; margin: 18px 0; }
.close-row {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}
.close-row input { flex: 1; }
.carry {
  margin-top: 14px;
  padding: 12px;
  border: 1px dashed #c9c2ee;
  border-radius: 8px;
  display: grid;
  gap: 10px;
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.log {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
  font-size: 13px;
}
.log li {
  background: #f6f8fb;
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.log em {
  flex-basis: 100%;
  color: #536078;
  font-style: normal;
}
.b-ok, .b-no {
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 12px;
}
.b-ok { background: #e8f4ef; color: #14724f; }
.b-no { background: #fdecea; color: #b3261e; }
@media (max-width: 720px) {
  .checks { grid-template-columns: 1fr; }
}
</style>
