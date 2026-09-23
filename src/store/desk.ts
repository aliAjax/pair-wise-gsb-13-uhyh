/**
 * 保存层：应用状态与持久化（Pinia + localStorage）。
 * 只负责数据的存取与流程编排；所有“能不能做、结果是什么”由 domain/rules 判定。
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  STORAGE_KEY,
  emptyDatabase,
  type DeskDatabase,
  type ManualRecord,
  type OutageEvent,
  type TerminalReceipt
} from "../data/types";
import { seedDatabase } from "../data/seed";
import {
  buildCorrection,
  canCloseShift,
  canResumeBusiness,
  classifyRecord,
  effectiveRecord,
  isFrozen,
  matchWithReceipt,
  round2,
  summarize,
  unfinishedRecords,
  validateEventDraft,
  validateManualInput,
  type ValidationResult
} from "../domain/rules";

function load(): DeskDatabase {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedDatabase();
  try {
    const parsed = JSON.parse(raw) as DeskDatabase;
    return parsed.version === 1 ? parsed : emptyDatabase();
  } catch {
    return emptyDatabase();
  }
}

export const useDeskStore = defineStore("outage-desk", () => {
  const db = ref<DeskDatabase>(load());
  const lastError = ref("");

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db.value));
  }

  function resetDemo() {
    db.value = seedDatabase();
    persist();
  }

  const events = computed(() => db.value.events);
  const activeEvent = computed<OutageEvent | null>(
    () => db.value.events.find((e) => e.id === db.value.activeEventId) ?? null
  );
  const frozen = computed(() => (activeEvent.value ? isFrozen(activeEvent.value) : false));

  /** ---------- 停电建档 ---------- */

  function createEvent(draft: {
    title: string;
    affectedNozzles: string[];
    startedAt: string;
    slipFrom: string;
    slipTo: string;
    shift: string;
  }): { ok: boolean; errors?: ValidationResult["errors"] } {
    const check = validateEventDraft(draft);
    if (!check.valid) return { ok: false, errors: check.errors };
    const event: OutageEvent = {
      id: crypto.randomUUID(),
      title: draft.title || "停电应急加油",
      affectedNozzles: draft.affectedNozzles,
      startedAt: draft.startedAt,
      slipFrom: draft.slipFrom.trim(),
      slipTo: draft.slipTo.trim(),
      shift: draft.shift,
      restoredAt: null,
      stage: "停电中",
      selfCheckPassed: false,
      selfCheckNote: "",
      nozzleResetPassed: false,
      nozzleResetNote: "",
      resumedAt: null,
      records: [],
      receipts: [],
      handovers: [],
      createdAt: new Date().toISOString()
    };
    db.value.events.push(event);
    db.value.activeEventId = event.id;
    persist();
    return { ok: true };
  }

  /** ---------- 手工加油单 ---------- */

  function addManualRecord(input: {
    plateTail: string;
    nozzle: string;
    liters: number | null;
    amount: number | null;
    payment: number | null;
    slipNo: string;
  }): { ok: boolean; errors?: ValidationResult["errors"] } {
    const event = activeEvent.value;
    if (!event || frozen.value) return { ok: false, errors: { form: frozen.value ? "事件已冻结" : "无活动事件" } };
    const check = validateManualInput(input, event);
    if (!check.valid) return { ok: false, errors: check.errors };

    const candidate = {
      slipNo: input.slipNo.trim(),
      payment: input.payment === null ? null : round2(input.payment)
    };
    const { status, reasons } = classifyRecord(candidate, event.records);
    const record: ManualRecord = {
      id: crypto.randomUUID(),
      plateTail: input.plateTail.trim().toUpperCase(),
      nozzle: input.nozzle,
      liters: Number(input.liters),
      amount: round2(Number(input.amount)),
      payment: candidate.payment,
      slipNo: candidate.slipNo,
      createdAt: new Date().toISOString(),
      status,
      pendingReasons: reasons,
      corrections: []
    };
    event.records.push(record);
    persist();
    return { ok: true };
  }

  /**
   * 补录：收款空缺或重复单号核对后补录修正。
   * 补录后重新判定状态（仍异常则继续留待补录）。
   */
  function supplementRecord(
    id: string,
    patch: { payment?: number | null; slipNo?: string }
  ): { ok: boolean; message?: string } {
    const event = activeEvent.value;
    if (!event || frozen.value) return { ok: false, message: frozen.value ? "事件已冻结，请走更正版本" : "无活动事件" };
    const record = event.records.find((r) => r.id === id);
    if (!record) return { ok: false, message: "记录不存在" };

    if (patch.slipNo !== undefined) record.slipNo = patch.slipNo.trim();
    if (patch.payment !== undefined) record.payment = patch.payment === null ? null : round2(patch.payment);

    const eff = effectiveRecord(record);
    const { status, reasons } = classifyRecord(
      { slipNo: eff.slipNo, payment: eff.payment, id: record.id },
      event.records
    );
    record.status = status;
    record.pendingReasons = reasons;
    record.diffNote = reasons.length ? record.diffNote : undefined;
    recomputeMatching(event);
    persist();
    return { ok: true, message: status === "待补录" ? "仍有待补录问题，继续挂起" : "补录完成，已重新进入小票匹配" };
  }

  /** ---------- 复电与终端小票 ---------- */

  function reportRestored() {
    const event = activeEvent.value;
    if (!event || event.stage !== "停电中") return;
    event.restoredAt = new Date().toISOString();
    event.stage = "已复电";
    persist();
  }

  function addReceipt(input: Omit<TerminalReceipt, "matched">): { ok: boolean; message?: string } {
    const event = activeEvent.value;
    if (!event || frozen.value) return { ok: false, message: frozen.value ? "事件已冻结" : "无活动事件" };
    if (event.receipts.some((r) => r.slipNo === input.slipNo.trim())) {
      return { ok: false, message: `小票 ${input.slipNo} 已导入` };
    }
    event.receipts.push({
      ...input,
      slipNo: input.slipNo.trim(),
      amount: round2(input.amount),
      matched: false
    });
    recomputeMatching(event);
    persist();
    return { ok: true };
  }

  /** 批量导入终端小票（复电后 POS 导出） */
  function importReceipts(rows: Array<Omit<TerminalReceipt, "matched">>): number {
    const event = activeEvent.value;
    if (!event || frozen.value) return 0;
    let added = 0;
    for (const row of rows) {
      if (event.receipts.some((r) => r.slipNo === row.slipNo.trim())) continue;
      event.receipts.push({ ...row, slipNo: row.slipNo.trim(), amount: round2(row.amount), matched: false });
      added += 1;
    }
    recomputeMatching(event);
    persist();
    return added;
  }

  /**
   * 重新执行小票匹配（按录入先后消费小票，避免一单多占）。
   * 待补录的单不参与；金额不符保持挂起、禁止核销。
   */
  function recomputeMatching(event: OutageEvent) {
    for (const r of event.receipts) r.matched = false;
    const ordered = [...event.records].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    for (const record of ordered) {
      if (record.status === "待补录") continue;
      const result = matchWithReceipt(record, event.receipts);
      record.status = result.status;
      record.matchedReceipt = result.matchedReceipt;
      record.diffNote = result.diffNote ?? (result.status === "已核销" ? undefined : record.diffNote);
      if (result.status === "已核销" && result.matchedReceipt) {
        const rc = event.receipts.find((r) => r.slipNo === result.matchedReceipt);
        if (rc) rc.matched = true;
      }
    }
  }

  /** 手工触发一次全量匹配 */
  function runMatching() {
    const event = activeEvent.value;
    if (!event) return;
    recomputeMatching(event);
    persist();
  }

  /** ---------- 更正版本（冻结后唯一更正途径） ---------- */

  function addCorrection(
    id: string,
    input: { reason: string; operator: string; patch: Parameters<typeof buildCorrection>[0]["patch"] }
  ): { ok: boolean; message?: string } {
    const event = activeEvent.value;
    if (!event) return { ok: false, message: "无活动事件" };
    if (!input.reason.trim()) return { ok: false, message: "更正必须填写原因" };
    const record = event.records.find((r) => r.id === id);
    if (!record) return { ok: false, message: "记录不存在" };

    const correction = buildCorrection({
      slipNo: record.slipNo,
      reason: input.reason.trim(),
      operator: input.operator.trim() || "值班员",
      patch: input.patch
    });
    record.corrections.push(correction);

    // 更正后重新判定 + 重新匹配（原始单保持不动，审计轨迹完整）
    const eff = effectiveRecord(record);
    const { status, reasons } = classifyRecord(
      { slipNo: eff.slipNo, payment: eff.payment, id: record.id },
      event.records
    );
    record.pendingReasons = reasons;
    if (reasons.length === 0) record.status = "待匹配";
    recomputeMatching(event);
    persist();
    return { ok: true, message: "更正版本已保存并重新核销" };
  }

  /** ---------- 自检 / 复位 / 恢复营业（冻结） ---------- */

  function setSelfCheck(passed: boolean, note: string) {
    const event = activeEvent.value;
    if (!event || frozen.value) return;
    event.selfCheckPassed = passed;
    event.selfCheckNote = note;
    persist();
  }

  function setNozzleReset(passed: boolean, note: string) {
    const event = activeEvent.value;
    if (!event || frozen.value) return;
    event.nozzleResetPassed = passed;
    event.nozzleResetNote = note;
    persist();
  }

  function resumeBusiness(): { ok: boolean; message?: string } {
    const event = activeEvent.value;
    if (!event) return { ok: false, message: "无活动事件" };
    if (!canResumeBusiness(event)) {
      return { ok: false, message: "设备自检与油枪复位均通过后，才能恢复营业" };
    }
    event.resumedAt = new Date().toISOString();
    event.stage = "已恢复营业";
    persist();
    return { ok: true, message: "已确认恢复营业，应急台数据冻结" };
  }

  /** ---------- 班次交接 ---------- */

  function attemptCloseShift(operator: string): { ok: boolean; message: string } {
    const event = activeEvent.value;
    if (!event) return { ok: false, message: "无活动事件" };
    const pending = unfinishedRecords(event);
    const closed = canCloseShift(event);
    event.handovers.push({
      id: crypto.randomUUID(),
      shift: event.shift,
      operator: operator.trim() || "值班员",
      closed,
      reason: closed ? "全部手工单已核销，账实一致" : `尚有 ${pending.length} 单未处理完，禁止关班`,
      createdAt: new Date().toISOString()
    });
    persist();
    return closed
      ? { ok: true, message: "本班已关班" }
      : { ok: false, message: `未处理完不能关班：${pending.map((r) => effectiveRecord(r).slipNo).join("、")}` };
  }

  /** 下一班写明原因，承接未处理单 */
  function carryToNextShift(input: { shift: string; operator: string; reason: string }) {
    const event = activeEvent.value;
    if (!event) return;
    event.shift = input.shift;
    event.handovers.push({
      id: crypto.randomUUID(),
      shift: input.shift,
      operator: input.operator.trim() || "下一班值班员",
      closed: false,
      reason: input.reason.trim(),
      createdAt: new Date().toISOString()
    });
    persist();
  }

  const summary = computed(() => (activeEvent.value ? summarize(activeEvent.value) : null));
  const unfinished = computed(() => (activeEvent.value ? unfinishedRecords(activeEvent.value) : []));
  const canResume = computed(() => (activeEvent.value ? canResumeBusiness(activeEvent.value) : false));
  const closeAllowed = computed(() => (activeEvent.value ? canCloseShift(activeEvent.value) : false));

  return {
    db,
    events,
    activeEvent,
    frozen,
    summary,
    unfinished,
    canResume,
    closeAllowed,
    lastError,
    resetDemo,
    createEvent,
    addManualRecord,
    supplementRecord,
    reportRestored,
    addReceipt,
    importReceipts,
    runMatching,
    addCorrection,
    setSelfCheck,
    setNozzleReset,
    resumeBusiness,
    attemptCloseShift,
    carryToNextShift
  };
});
