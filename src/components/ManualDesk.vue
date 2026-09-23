<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useDeskStore } from "../store/desk";
import { effectiveRecord, round2 } from "../domain/rules";
import type { ManualRecord } from "../data/types";

const store = useDeskStore();

const blank = () => ({
  plateTail: "",
  nozzle: "",
  liters: null as number | null,
  amount: null as number | null,
  payment: null as number | null,
  slipNo: ""
});
const form = reactive(blank());
const errors = reactive<Record<string, string>>({});
const feedback = ref("");
const filter = ref<"全部" | "待补录" | "待匹配" | "金额不符" | "已核销" | "无小票">("全部");

const nozzleOptions = computed(() => store.activeEvent?.affectedNozzles ?? []);

const filtered = computed(() => {
  const list = [...(store.activeEvent?.records ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return filter.value === "全部" ? list : list.filter((r) => r.status === filter.value);
});

function submit() {
  feedback.value = "";
  Object.keys(errors).forEach((k) => delete errors[k]);
  const result = store.addManualRecord({ ...form });
  if (!result.ok) {
    Object.assign(errors, result.errors);
    feedback.value = "请修正表单后再保存";
    return;
  }
  Object.assign(form, blank());
  feedback.value = "已登记；若收款空缺或单号重复，系统已自动挂入待补录";
}

/* 补录弹层 */
const supplementTarget = ref<ManualRecord | null>(null);
const supplementForm = reactive({ payment: "" as string | number, slipNo: "" });

function openSupplement(r: ManualRecord) {
  supplementTarget.value = r;
  const eff = effectiveRecord(r);
  supplementForm.payment = eff.payment ?? "";
  supplementForm.slipNo = eff.slipNo;
}

function saveSupplement() {
  if (!supplementTarget.value) return;
  const payment = supplementForm.payment === "" ? null : Number(supplementForm.payment);
  const res = store.supplementRecord(supplementTarget.value.id, {
    payment,
    slipNo: String(supplementForm.slipNo)
  });
  feedback.value = res.message ?? "";
  supplementTarget.value = null;
}

/* 更正版本弹层 */
const correctionTarget = ref<ManualRecord | null>(null);
const correctionForm = reactive({
  reason: "",
  operator: "",
  plateTail: "",
  nozzle: "",
  liters: "" as string | number,
  amount: "" as string | number,
  payment: "" as string | number,
  slipNo: ""
});

function openCorrection(r: ManualRecord) {
  correctionTarget.value = r;
  const eff = effectiveRecord(r);
  Object.assign(correctionForm, {
    reason: "",
    operator: "",
    plateTail: eff.plateTail,
    nozzle: eff.nozzle,
    liters: eff.liters,
    amount: eff.amount,
    payment: eff.payment ?? "",
    slipNo: eff.slipNo
  });
}

function saveCorrection() {
  if (!correctionTarget.value) return;
  const eff = effectiveRecord(correctionTarget.value);
  const patch: NonNullable<Parameters<typeof store.addCorrection>[1]["patch"]> = {};

  const plate = correctionForm.plateTail.trim().toUpperCase();
  if (plate && plate !== eff.plateTail) patch.plateTail = plate;
  if (correctionForm.nozzle && correctionForm.nozzle !== eff.nozzle) patch.nozzle = correctionForm.nozzle;

  const liters = Number(correctionForm.liters);
  if (Number.isFinite(liters) && liters !== eff.liters) patch.liters = liters;

  const amount = Number(correctionForm.amount);
  if (Number.isFinite(amount) && amount !== eff.amount) patch.amount = round2(amount);

  const newPayment = correctionForm.payment === "" ? null : Number(correctionForm.payment);
  if (newPayment !== eff.payment && (newPayment === null || Number.isFinite(newPayment))) {
    patch.payment = newPayment;
  }

  const slipNo = String(correctionForm.slipNo).trim();
  if (slipNo && slipNo !== eff.slipNo) patch.slipNo = slipNo;

  const res = store.addCorrection(correctionTarget.value.id, {
    reason: correctionForm.reason,
    operator: correctionForm.operator,
    patch
  });
  feedback.value = res.message ?? "";
  correctionTarget.value = null;
}

const statusClass: Record<string, string> = {
  待补录: "st-pending",
  待匹配: "st-wait",
  已核销: "st-ok",
  金额不符: "st-diff",
  无小票: "st-miss"
};

const disabled = computed(() => store.frozen || store.activeEvent?.stage !== "停电中");
</script>

<template>
  <section class="panel">
    <div class="head">
      <h2>手工加油（纸单登记）</h2>
      <select v-model="filter" class="filter">
        <option>全部</option>
        <option>待补录</option>
        <option>待匹配</option>
        <option>金额不符</option>
        <option>无小票</option>
        <option>已核销</option>
      </select>
    </div>
    <p class="rule">
      填写车牌后三位、枪号、升数、收款与纸单号；<b>收款留空或单号重复将自动挂入“待补录”</b>，复电后再补。
    </p>

    <form v-if="!disabled" class="form-grid" @submit.prevent="submit">
      <div class="row">
        <label>
          车牌后三位
          <input v-model="form.plateTail" maxlength="3" placeholder="如 A8F" />
          <small v-if="errors.plateTail" class="err">{{ errors.plateTail }}</small>
        </label>
        <label>
          枪号
          <select v-model="form.nozzle">
            <option value="">请选择</option>
            <option v-for="n in nozzleOptions" :key="n" :value="n">{{ n }} 号枪</option>
          </select>
          <small v-if="errors.nozzle" class="err">{{ errors.nozzle }}</small>
        </label>
      </div>
      <div class="row">
        <label>
          升数（L）
          <input v-model.number="form.liters" type="number" min="0" step="0.01" placeholder="0.00" />
          <small v-if="errors.liters" class="err">{{ errors.liters }}</small>
        </label>
        <label>
          应收金额（元）
          <input v-model.number="form.amount" type="number" min="0" step="0.01" placeholder="0.00" />
          <small v-if="errors.amount" class="err">{{ errors.amount }}</small>
        </label>
      </div>
      <div class="row">
        <label>
          实际收款（元，空缺＝待补录）
          <input v-model.number="form.payment" type="number" min="0" step="0.01" placeholder="留空待补录" />
          <small v-if="errors.payment" class="err">{{ errors.payment }}</small>
        </label>
        <label>
          纸单号
          <input v-model="form.slipNo" placeholder="如 Z005" />
          <small v-if="errors.slipNo" class="err">{{ errors.slipNo }}</small>
        </label>
      </div>
      <button type="submit">登记纸单</button>
      <p v-if="feedback" class="fb">{{ feedback }}</p>
    </form>
    <p v-else class="locked">当前阶段不可登记新纸单（复电后仅做匹配/补录/更正）。</p>

    <div class="records">
      <div v-if="filtered.length === 0" class="empty">暂无纸单</div>
      <article v-for="r in filtered" :key="r.id" class="record">
        <div class="record-head">
          <strong>纸单 {{ effectiveRecord(r).slipNo }}</strong>
          <span class="status" :class="statusClass[r.status]">{{ r.status }}</span>
        </div>
        <div class="details">
          <span>车牌：{{ effectiveRecord(r).plateTail }}</span>
          <span>枪号：{{ effectiveRecord(r).nozzle }}</span>
          <span>升数：{{ effectiveRecord(r).liters.toFixed(2) }} L</span>
          <span>应收：¥{{ effectiveRecord(r).amount.toFixed(2) }}</span>
          <span>收款：{{ effectiveRecord(r).payment === null ? "空缺（待补录）" : `¥${effectiveRecord(r).payment.toFixed(2)}` }}</span>
          <span>登记：{{ new Date(r.createdAt).toLocaleTimeString("zh-CN") }}</span>
        </div>
        <div v-if="r.pendingReasons.length" class="reasons">
          待补录原因：{{ r.pendingReasons.join("、") }}
        </div>
        <div v-if="r.diffNote" class="diff-note">⚠ {{ r.diffNote }}</div>
        <div v-if="r.matchedReceipt" class="match">已匹配终端小票：{{ r.matchedReceipt }}</div>

        <div v-if="r.corrections.length" class="corrections">
          <p v-for="(c, i) in r.corrections" :key="c.id">
            更正 v{{ i + 1 }}（{{ new Date(c.createdAt).toLocaleString("zh-CN") }}，{{ c.operator }}）：{{ c.reason }}
          </p>
        </div>

        <div class="actions">
          <button
            v-if="r.status === '待补录' && !store.frozen"
            type="button"
            class="secondary"
            @click="openSupplement(r)"
          >
            补录
          </button>
          <button type="button" class="ghost" @click="openCorrection(r)">
            更正版本（填原因）
          </button>
        </div>
      </article>
    </div>

    <!-- 补录弹层 -->
    <div v-if="supplementTarget" class="modal-mask" @click.self="supplementTarget = null">
      <div class="modal">
        <h3>补录纸单 {{ effectiveRecord(supplementTarget).slipNo }}</h3>
        <p class="rule">重复单号核对原件后修正单号；收款空缺补填实际收款。</p>
        <label>
          实际收款（元）
          <input v-model.number="supplementForm.payment" type="number" step="0.01" placeholder="仍不明确可继续留空" />
        </label>
        <label>
          纸单号
          <input v-model="supplementForm.slipNo" />
        </label>
        <div class="modal-actions">
          <button type="button" class="secondary" @click="supplementTarget = null">取消</button>
          <button type="button" @click="saveSupplement">保存补录</button>
        </div>
      </div>
    </div>

    <!-- 更正版本弹层 -->
    <div v-if="correctionTarget" class="modal-mask" @click.self="correctionTarget = null">
      <div class="modal">
        <h3>另建更正版本 · 纸单 {{ effectiveRecord(correctionTarget).slipNo }}</h3>
        <p class="rule">原始单不会被覆盖，更正以新版本追加并留痕。冻结后这是唯一更正途径。</p>
        <label>
          更正原因<span class="req">*</span>
          <textarea v-model="correctionForm.reason" placeholder="如：纸单字迹潦草，金额 237 误抄为 273" />
        </label>
        <label>操作人
          <input v-model="correctionForm.operator" placeholder="值班员姓名" />
        </label>
        <div class="row">
          <label>车牌后三位<input v-model="correctionForm.plateTail" maxlength="3" /></label>
          <label>
            枪号
            <select v-model="correctionForm.nozzle">
              <option v-for="n in nozzleOptions" :key="n" :value="n">{{ n }} 号枪</option>
            </select>
          </label>
        </div>
        <div class="row">
          <label>升数<input v-model.number="correctionForm.liters" type="number" step="0.01" /></label>
          <label>应收金额<input v-model.number="correctionForm.amount" type="number" step="0.01" /></label>
        </div>
        <div class="row">
          <label>实际收款<input v-model.number="correctionForm.payment" type="number" step="0.01" placeholder="留空表示仍空缺" /></label>
          <label>纸单号<input v-model="correctionForm.slipNo" /></label>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary" @click="correctionTarget = null">取消</button>
          <button type="button" @click="saveCorrection">提交更正版本</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
h2 {
  margin: 0;
}
.filter {
  width: auto;
}
.rule {
  color: #69758c;
  font-size: 13px;
  margin: 8px 0 12px;
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.err {
  color: #c84b31;
}
.fb {
  margin: 6px 0 0;
  color: #14724f;
  font-size: 13px;
}
.locked {
  background: #f6f8fb;
  border-radius: 8px;
  padding: 10px 12px;
  color: #69758c;
  font-size: 13px;
}
.records {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}
.record {
  border: 1px solid #dfe7f1;
  border-radius: 8px;
  padding: 12px;
  background: #fbfcfe;
}
.record-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.status {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  white-space: nowrap;
}
.st-pending { background: #fdecea; color: #b3261e; }
.st-wait { background: #e8f0fe; color: #1a56c8; }
.st-ok { background: #e8f4ef; color: #14724f; }
.st-diff { background: #fff4e5; color: #b35a00; }
.st-miss { background: #f3f0ff; color: #5b3db3; }
.details {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px 12px;
  margin: 10px 0;
  color: #536078;
  font-size: 13px;
}
.reasons {
  background: #fdecea;
  color: #b3261e;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  margin-bottom: 8px;
}
.diff-note {
  background: #fff4e5;
  color: #b35a00;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  margin-bottom: 8px;
}
.match {
  font-size: 12px;
  color: #14724f;
  margin-bottom: 8px;
}
.corrections {
  border-left: 3px solid #8a7fd9;
  padding-left: 10px;
  margin-bottom: 8px;
  color: #5b3db3;
  font-size: 12px;
}
.corrections p {
  margin: 4px 0;
}
.actions {
  display: flex;
  gap: 8px;
}
button.ghost {
  background: transparent;
  color: #5b3db3;
  border: 1px solid #c9c2ee;
}
.empty {
  text-align: center;
  color: #69758c;
  padding: 24px;
}
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(23, 32, 51, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 16px;
}
.modal {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  width: min(520px, 100%);
  display: grid;
  gap: 12px;
  max-height: 90vh;
  overflow: auto;
}
.modal h3 {
  margin: 0;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.req {
  color: #c84b31;
}
@media (max-width: 720px) {
  .details { grid-template-columns: 1fr 1fr; }
}
</style>
