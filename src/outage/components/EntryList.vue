<script setup lang="ts">
/** 纸单台账：状态过滤、补录/更正（冻结后强制原因版本）、匹配终端小票核销 */
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useOutageStore } from "../store";
import { eqAmount, eqLiters, normText } from "../rules";
import type { ManualEntry, TerminalReceipt } from "../types";
import { ENTRY_STATUS_META, FIELD_LABELS, fmtDateTime, yuan } from "../format";

const store = useOutageStore();

const filterStatus = ref<"ALL" | ManualEntry["status"]>("ALL");
const filtered = computed(() =>
  filterStatus.value === "ALL"
    ? store.entries
    : store.entries.filter((e) => e.status === filterStatus.value)
);

const frozen = computed(() => store.outage?.frozen === true);
const canReconcilePhase = computed(
  () => store.outage?.phase === "POWER_RESTORED" || store.outage?.phase === "RESUMED"
);

/* ------------------------------ 补录 / 更正 ------------------------------ */

const editVisible = ref(false);
const editTarget = ref<ManualEntry | null>(null);
const editForm = reactive({
  plateTail: "",
  gunNo: "",
  liters: 0,
  amount: null as number | null,
  paperNo: "",
  remark: "",
  reason: ""
});

function openEdit(entry: ManualEntry) {
  editTarget.value = entry;
  editForm.plateTail = entry.plateTail;
  editForm.gunNo = entry.gunNo;
  editForm.liters = entry.liters;
  editForm.amount = entry.amount;
  editForm.paperNo = entry.paperNo;
  editForm.remark = entry.remark;
  editForm.reason = "";
  editVisible.value = true;
}

function submitEdit() {
  if (!editTarget.value) return;
  const res = store.updateEntry(
    editTarget.value.id,
    {
      plateTail: editForm.plateTail,
      gunNo: editForm.gunNo,
      liters: editForm.liters,
      amount: editForm.amount,
      paperNo: editForm.paperNo,
      remark: editForm.remark
    },
    frozen.value ? editForm.reason : editForm.reason || "补录"
  );
  if (!res.ok) {
    ElMessage.error(res.error);
    return;
  }
  ElMessage.success(frozen.value ? "已生成原因版本并更正" : "补录完成");
  editVisible.value = false;
}

/* ------------------------------ 小票核销 ------------------------------ */

const matchVisible = ref(false);
const matchTarget = ref<ManualEntry | null>(null);
const selectedReceiptId = ref("");

const matchCandidates = computed<TerminalReceipt[]>(() =>
  matchTarget.value ? store.candidatesFor(matchTarget.value) : []
);
const allUnused = computed(() => store.receipts.filter((r) => !r.used));

function keyOk(e: ManualEntry, r: TerminalReceipt): boolean {
  return normText(e.gunNo) === normText(r.gunNo) && normText(e.plateTail) === normText(r.plateTail);
}

function openMatch(entry: ManualEntry) {
  matchTarget.value = entry;
  selectedReceiptId.value = matchCandidates.value[0]?.id ?? "";
  matchVisible.value = true;
}

function submitMatch() {
  if (!matchTarget.value || !selectedReceiptId.value) {
    ElMessage.error("请选择一张终端小票");
    return;
  }
  const res = store.tryReconcile(matchTarget.value.id, selectedReceiptId.value);
  if (res.ok) {
    ElMessage.success(res.message);
    matchVisible.value = false;
  } else {
    ElMessage.error(res.message);
  }
}

function receiptOf(entry: ManualEntry): TerminalReceipt | undefined {
  return store.receipts.find((r) => r.id === entry.receiptId);
}

const filterOptions = [
  { value: "ALL", label: "全部" },
  { value: "PENDING_SUPPLEMENT", label: "待补录" },
  { value: "PENDING_RECONCILE", label: "待核销" },
  { value: "MISMATCH", label: "金额不符" },
  { value: "RECONCILED", label: "已核销" }
] as const;
</script>

<template>
  <el-card shadow="never" class="panel-card">
    <template #header>
      <div class="head">
        <span class="card-title">③ 手工纸单台账</span>
        <el-radio-group v-model="filterStatus" size="small">
          <el-radio-button v-for="o in filterOptions" :key="o.value" :value="o.value">
            {{ o.label }}
          </el-radio-button>
        </el-radio-group>
      </div>
    </template>

    <el-table :data="filtered" size="small" stripe empty-text="暂无纸单">
      <el-table-column label="纸单号" prop="paperNo" width="150" />
      <el-table-column label="车牌" prop="plateTail" width="70" />
      <el-table-column label="枪号" width="60">
        <template #default="{ row }: { row: ManualEntry }">{{ row.gunNo }}#</template>
      </el-table-column>
      <el-table-column label="升数" width="80">
        <template #default="{ row }: { row: ManualEntry }">{{ row.liters }} L</template>
      </el-table-column>
      <el-table-column label="收款" width="95">
        <template #default="{ row }: { row: ManualEntry }">
          <span :class="{ 'amount-missing': row.amount === null }">{{ yuan(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }: { row: ManualEntry }">
          <el-tag :type="ENTRY_STATUS_META[row.status].type" size="small">
            {{ ENTRY_STATUS_META[row.status].label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="留待 / 提示" min-width="180">
        <template #default="{ row }: { row: ManualEntry }">
          <el-tag v-for="h in row.holdReasons" :key="h" type="warning" size="small" effect="plain" class="chip">
            {{ h }}
          </el-tag>
          <el-tag v-for="w in row.warnings" :key="w" type="info" size="small" effect="plain" class="chip">
            {{ w }}
          </el-tag>
          <span v-if="!row.holdReasons.length && !row.warnings.length" class="dim">—</span>
        </template>
      </el-table-column>
      <el-table-column label="小票 / 备注" min-width="180">
        <template #default="{ row }: { row: ManualEntry }">
          <p v-if="receiptOf(row)" class="line ok">
            小票：{{ receiptOf(row)?.gunNo }}# / {{ receiptOf(row)?.plateTail }} /
            {{ receiptOf(row)?.liters }}L / {{ receiptOf(row)?.amount }}元
          </p>
          <p v-if="row.lastMatchNote" class="line" :class="{ ok: row.status === 'RECONCILED', bad: row.status === 'MISMATCH' }">
            {{ row.lastMatchNote }}
          </p>
          <p v-if="row.remark" class="line dim">备注：{{ row.remark }}</p>
          <p v-if="row.supplementNote" class="line dim">
            {{ row.supplementNote }}（{{ fmtDateTime(row.supplementAt) }}）
          </p>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="170" fixed="right">
        <template #default="{ row }: { row: ManualEntry }">
          <el-button
            size="small"
            :type="row.status === 'RECONCILED' ? 'warning' : 'primary'"
            plain
            @click="openEdit(row)"
          >
            {{ row.status === "RECONCILED" ? (frozen ? "更正" : "修改") : "补录/更正" }}
          </el-button>
          <el-button
            v-if="canReconcilePhase && (row.status === 'PENDING_RECONCILE' || row.status === 'MISMATCH')"
            size="small"
            type="success"
            plain
            @click="openMatch(row)"
          >
            匹配小票
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 补录 / 更正弹窗 -->
    <el-dialog
      v-model="editVisible"
      :title="frozen ? '冻结数据更正（另建原因版本）' : '补录 / 更正纸单'"
      width="520px"
    >
      <el-alert
        v-if="frozen"
        type="warning"
        :closable="false"
        show-icon
        title="数据已冻结：更正不会覆盖历史，逐字段生成原因版本；更正关键字段的已核销单须重新匹配小票。"
        class="mb"
      />
      <el-form label-position="top">
        <el-row :gutter="10">
          <el-col :span="12">
            <el-form-item label="车牌后三位" required>
              <el-input v-model="editForm.plateTail" maxlength="3" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="枪号" required>
              <el-input v-model="editForm.gunNo" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="10">
          <el-col :span="12">
            <el-form-item label="升数 (L)" required>
              <el-input-number v-model="editForm.liters" :min="0.01" :precision="2" controls-position="right" class="full" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="收款（元）" required>
              <el-input-number
                v-model="editForm.amount"
                :min="0"
                :precision="2"
                controls-position="right"
                class="full"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="纸单号" required>
          <el-input v-model="editForm.paperNo" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editForm.remark" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item v-if="frozen" label="更正原因（必填，随原因版本留痕）" required>
          <el-input
            v-model="editForm.reason"
            type="textarea"
            :rows="2"
            placeholder="如：车主来电确认实际收款 260 元，纸单误写 26 元"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button :type="frozen ? 'warning' : 'primary'" @click="submitEdit">
          {{ frozen ? "提交更正并生成版本" : "保存补录" }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 小票匹配弹窗 -->
    <el-dialog v-model="matchVisible" title="复电后匹配终端小票" width="680px">
      <el-alert
        v-if="matchTarget"
        :type="matchTarget.status === 'MISMATCH' ? 'error' : 'info'"
        :closable="false"
        show-icon
        class="mb"
        :title="matchTarget.status === 'MISMATCH'
          ? `该单曾因${matchTarget.lastMatchNote?.includes('金额') ? '金额' : '信息'}不符被驳回，请核对后改配正确小票；金额仍不符依旧不得核销。`
          : '按枪号 + 车牌后三位匹配，升数、金额必须一致；金额不符不得核销。'"
      />
      <div v-if="matchTarget" class="paper-summary">
        纸单：<b>{{ matchTarget.paperNo }}</b> · {{ matchTarget.gunNo }}# · {{ matchTarget.plateTail }}
        · {{ matchTarget.liters }}L · {{ yuan(matchTarget.amount) }}
      </div>

      <el-table
        :data="allUnused"
        size="small"
        highlight-current-row
        max-height="320"
        empty-text="暂未录入终端小票"
        @current-change="(row: TerminalReceipt | null) => row && (selectedReceiptId = row.id)"
      >
        <el-table-column width="46">
          <template #default="{ row }: { row: TerminalReceipt }">
            <el-radio v-model="selectedReceiptId" :value="row.id"><span /></el-radio>
          </template>
        </el-table-column>
        <el-table-column label="终端小票（时间 / 枪 / 车牌）" min-width="190">
          <template #default="{ row }: { row: TerminalReceipt }">
            {{ fmtDateTime(row.createdAt) }} · {{ row.gunNo }}# · {{ row.plateTail }}
          </template>
        </el-table-column>
        <el-table-column label="升数" width="110">
          <template #default="{ row }: { row: TerminalReceipt }">
            <span :class="matchTarget && eqLiters(matchTarget.liters, row.liters) ? 'ok' : 'bad'">
              {{ row.liters }} L
            </span>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="110">
          <template #default="{ row }: { row: TerminalReceipt }">
            <span
              v-if="matchTarget"
              :class="matchTarget.amount !== null && eqAmount(matchTarget.amount, row.amount) ? 'ok' : 'bad'"
            >
              {{ row.amount }} 元
            </span>
          </template>
        </el-table-column>
        <el-table-column label="匹配" width="150">
          <template #default="{ row }: { row: TerminalReceipt }">
            <el-tag v-if="matchTarget && keyOk(matchTarget, row)" type="success" size="small">枪/牌一致</el-tag>
            <el-tag v-else type="info" size="small">主键不符</el-tag>
            <el-tag
              v-if="matchCandidates.some((c) => c.id === row.id)"
              type="warning"
              size="small"
              class="chip"
            >推荐</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="matchVisible = false">取消</el-button>
        <el-button type="success" :disabled="!selectedReceiptId" @click="submitMatch">
          核对一致，确认核销
        </el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<style scoped>
.head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.mb { margin-bottom: 12px; }
.chip { margin: 2px 4px 2px 0; }
.dim { color: #909399; }
.ok { color: #16834c; }
.bad { color: #c45656; }
.line { margin: 2px 0; font-size: 12px; }
.amount-missing { color: #c45656; font-weight: 700; }
.full { width: 100%; }
.paper-summary {
  background: #f4f8ff;
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 10px;
  font-size: 13px;
}
</style>
