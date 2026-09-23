/**
 * 停电应急加油台 —— 编排层
 * 用 Pinia 串联 数据 / 判定 / 保存：状态在这里被修改，
 * 修改前调用判定层函数，修改后调用保存层持久化。不含任何页面代码。
 */
import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  CorrectionVersion,
  EntryDraft,
  ManualEntry,
  OutageState,
  Shift,
  TerminalReceipt
} from "./types";
import { loadState, resetState, saveState } from "./storage";
import {
  activeShift,
  checkCloseShift,
  checkResume,
  eqAmount,
  eqLiters,
  evaluateEntry,
  handoverReasonValid,
  normText,
  paperRangeValid,
  rankReceipts,
  reconcile
} from "./rules";

function nowIso(): string {
  return new Date().toISOString();
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export interface OutageDraft {
  affectedGuns: string[];
  startedAt: string;
  paperStart: string;
  paperEnd: string;
}

export interface ReceiptDraft {
  gunNo: string;
  plateTail: string;
  liters: number | null;
  amount: number | null;
}

export const useOutageStore = defineStore("outage", () => {
  const state = ref<OutageState>(loadState());

  function persist() {
    saveState(state.value);
  }

  function commit(mutator: () => void) {
    mutator();
    persist();
  }

  /* ------------------------------ 查询视图 ------------------------------ */

  const outage = computed(() => state.value.outage);
  const entries = computed(() => state.value.entries);
  const receipts = computed(() => state.value.receipts);
  const corrections = computed(() => state.value.corrections);
  const shifts = computed(() => state.value.shifts);
  const currentShift = computed<Shift | null>(() => activeShift(state.value));

  const summary = computed(() => {
    const list = state.value.entries;
    return {
      total: list.length,
      pendingSupplement: list.filter((e) => e.status === "PENDING_SUPPLEMENT").length,
      pendingReconcile: list.filter((e) => e.status === "PENDING_RECONCILE").length,
      mismatch: list.filter((e) => e.status === "MISMATCH").length,
      reconciled: list.filter((e) => e.status === "RECONCILED").length,
      reconciledLiters: list
        .filter((e) => e.status === "RECONCILED")
        .reduce((acc, e) => acc + e.liters, 0),
      reconciledAmount: list
        .filter((e) => e.status === "RECONCILED" && e.amount !== null)
        .reduce((acc, e) => acc + (e.amount ?? 0), 0),
      receiptsPending: state.value.receipts.filter((r) => !r.used).length
    };
  });

  const resumeInfo = computed(() => checkResume(state.value));
  const closeInfo = computed(() =>
    currentShift.value ? checkCloseShift(state.value, currentShift.value) : null
  );

  function candidatesFor(entry: ManualEntry) {
    return rankReceipts(entry, state.value.receipts);
  }

  /* ------------------------------ 基础设置 ------------------------------ */

  function setOperator(name: string) {
    commit(() => {
      state.value.operator = name.trim();
    });
  }

  /* ---------------------------- 停电事件登记 ---------------------------- */

  function registerOutage(draft: OutageDraft): { ok: boolean; error?: string } {
    if (state.value.outage) {
      return { ok: false, error: "本班次已登记过停电事件" };
    }
    if (draft.affectedGuns.length === 0) {
      return { ok: false, error: "请至少填写一个受影响油枪" };
    }
    if (!draft.startedAt) {
      return { ok: false, error: "请填写停电开始时刻" };
    }
    if (!paperRangeValid(draft.paperStart, draft.paperEnd)) {
      return { ok: false, error: "纸单号范围无效：需同前缀且止号不小于起号" };
    }
    commit(() => {
      state.value.outage = {
        id: uid("out"),
        phase: "ACTIVE",
        affectedGuns: draft.affectedGuns.map((g) => g.trim()).filter(Boolean),
        startedAt: new Date(draft.startedAt).toISOString(),
        paperStart: draft.paperStart.trim().toUpperCase(),
        paperEnd: draft.paperEnd.trim().toUpperCase(),
        powerRestoredAt: null,
        deviceSelfCheckPassed: false,
        deviceSelfCheckAt: null,
        gunResetPassed: false,
        gunResetAt: null,
        resumedAt: null,
        frozen: false
      };
    });
    return { ok: true };
  }

  /* ------------------------------ 手工加油 ------------------------------ */

  function addEntry(draft: EntryDraft): {
    ok: boolean;
    error?: string;
    holdReasons?: string[];
    warnings?: string[];
  } {
    const event = state.value.outage;
    const shift = currentShift.value;
    if (!event) return { ok: false, error: "请先登记停电事件" };
    if (event.phase !== "ACTIVE") return { ok: false, error: "已复电，不能再补登记停电期间纸单" };
    if (!shift) return { ok: false, error: "当前没有进行中的班次" };
    if (!draft.plateTail.trim()) return { ok: false, error: "请填写车牌后三位" };
    if (!draft.gunNo.trim()) return { ok: false, error: "请填写枪号" };
    if (draft.liters === null || draft.liters <= 0) return { ok: false, error: "升数必须大于 0" };
    if (!draft.paperNo.trim()) return { ok: false, error: "请填写纸单号" };

    const check = evaluateEntry(
      {
        paperNo: draft.paperNo.trim(),
        amount: draft.amount,
        gunNo: draft.gunNo.trim(),
        liters: draft.liters
      },
      state.value.entries,
      event
    );

    commit(() => {
      const entry: ManualEntry = {
        id: uid("entry"),
        createdAt: nowIso(),
        shiftId: shift.id,
        plateTail: normText(draft.plateTail),
        gunNo: draft.gunNo.trim(),
        liters: draft.liters as number,
        amount: draft.amount,
        paperNo: draft.paperNo.trim().toUpperCase(),
        status: check.holdReasons.length > 0 ? "PENDING_SUPPLEMENT" : "PENDING_RECONCILE",
        holdReasons: check.holdReasons,
        warnings: check.warnings,
        remark: draft.remark.trim(),
        supplementNote: null,
        supplementAt: null,
        reconciledAt: null,
        receiptId: null,
        lastMatchNote: check.holdReasons.length
          ? `先留待补录：${check.holdReasons.join("、")}`
          : null
      };
      state.value.entries.unshift(entry);
    });
    return { ok: true, holdReasons: check.holdReasons, warnings: check.warnings };
  }

  /** 重新计算留待原因与提示（补录 / 更正后调用） */
  function reevaluate(entry: ManualEntry) {
    const event = state.value.outage;
    if (!event) return;
    const others = state.value.entries.filter((e) => e.id !== entry.id);
    const check = evaluateEntry(
      {
        paperNo: entry.paperNo,
        amount: entry.amount,
        gunNo: entry.gunNo,
        liters: entry.liters
      },
      others,
      event
    );
    entry.holdReasons = check.holdReasons;
    entry.warnings = check.warnings;
  }

  /** 释放某纸单占用的小票（冻结后更正关键字段时使用） */
  function releaseReceipt(entry: ManualEntry) {
    if (!entry.receiptId) return;
    const receipt = state.value.receipts.find((r) => r.id === entry.receiptId);
    if (receipt) {
      receipt.used = false;
      receipt.matchedEntryId = null;
    }
    entry.receiptId = null;
    entry.reconciledAt = null;
  }

  /**
   * 补录 / 更正纸单。
   * 冻结前可直接补录；冻结后必须填写更正原因，逐字段生成“原因版本”。
   */
  function updateEntry(
    id: string,
    patch: Partial<Pick<ManualEntry, "plateTail" | "gunNo" | "liters" | "amount" | "paperNo" | "remark">>,
    note?: string
  ): { ok: boolean; error?: string } {
    const entry = state.value.entries.find((e) => e.id === id);
    if (!entry) return { ok: false, error: "纸单不存在" };
    const frozen = state.value.outage?.frozen === true;
    const reason = note?.trim() ?? "";
    if (frozen && !handoverReasonValid(reason)) {
      return { ok: false, error: "冻结后更正必须填写不少于 5 个字的原因" };
    }

    const trackedFields = ["plateTail", "gunNo", "liters", "amount", "paperNo"] as const;
    const changes = trackedFields
      .filter((f) => patch[f] !== undefined && String(patch[f]) !== String(entry[f]))
      .map((f) => ({ field: f, before: String(entry[f]), after: String(patch[f]) }));

    if (frozen && changes.length === 0 && (patch.remark === undefined || patch.remark === entry.remark)) {
      return { ok: false, error: "没有可更正的内容" };
    }

    commit(() => {
      if (frozen && changes.length > 0) {
        const versions: CorrectionVersion[] = changes.map((c) => ({
          id: uid("corr"),
          createdAt: nowIso(),
          operator: state.value.operator,
          reason,
          target: "ENTRY",
          targetId: entry.id,
          field: c.field,
          before: c.before,
          after: c.after
        }));
        state.value.corrections.unshift(...versions);
        state.value.version += 1;
      }

      const wasReconciled = entry.status === "RECONCILED";
      const keyChanged =
        frozen &&
        wasReconciled &&
        (changes.some((c) => ["plateTail", "gunNo", "liters", "amount"].includes(c.field)));

      Object.assign(entry, patch);
      reevaluate(entry);
      entry.supplementNote = frozen ? `冻结更正：${reason}` : (note?.trim() || "补录完成");
      entry.supplementAt = nowIso();

      if (keyChanged) {
        releaseReceipt(entry);
        entry.status = "PENDING_RECONCILE";
        entry.lastMatchNote = `冻结更正关键字段，原核销撤销，须重新匹配小票（原因：${reason}）`;
      } else {
        entry.status = entry.holdReasons.length > 0 ? "PENDING_SUPPLEMENT" : "PENDING_RECONCILE";
        entry.lastMatchNote = frozen
          ? `已按原因版本更正：${reason}`
          : "补录完成，可参与小票匹配";
      }
    });
    return { ok: true };
  }

  /* ------------------------------ 终端小票 ------------------------------ */

  function addReceipt(draft: ReceiptDraft): { ok: boolean; error?: string } {
    if (state.value.outage?.phase !== "POWER_RESTORED") {
      return { ok: false, error: "只有复电后才能录入终端补传小票" };
    }
    if (!draft.gunNo.trim() || !draft.plateTail.trim()) {
      return { ok: false, error: "枪号和车牌后三位必填" };
    }
    if (draft.liters === null || draft.liters <= 0 || draft.amount === null || draft.amount < 0) {
      return { ok: false, error: "升数、金额必须为有效数字" };
    }
    commit(() => {
      const receipt: TerminalReceipt = {
        id: uid("rcpt"),
        createdAt: nowIso(),
        gunNo: draft.gunNo.trim(),
        plateTail: normText(draft.plateTail),
        liters: draft.liters as number,
        amount: draft.amount as number,
        used: false,
        matchedEntryId: null
      };
      state.value.receipts.unshift(receipt);
    });
    return { ok: true };
  }

  /** 复电后匹配终端小票；金额不符不得核销 */
  function tryReconcile(entryId: string, receiptId: string): { ok: boolean; message: string } {
    const entry = state.value.entries.find((e) => e.id === entryId);
    const receipt = state.value.receipts.find((r) => r.id === receiptId);
    if (!entry || !receipt) return { ok: false, message: "纸单或小票不存在" };

    const result = reconcile(entry, receipt);
    if (result.ok) {
      commit(() => {
        entry.status = "RECONCILED";
        entry.receiptId = receipt.id;
        entry.reconciledAt = nowIso();
        entry.holdReasons = [];
        entry.lastMatchNote = result.detail;
        receipt.used = true;
        receipt.matchedEntryId = entry.id;
      });
    } else if (result.code === "AMOUNT_MISMATCH") {
      commit(() => {
        entry.status = "MISMATCH";
        entry.lastMatchNote = result.detail;
      });
    }
    return { ok: result.ok, message: result.detail };
  }

  /* --------------------------- 复电 / 自检 / 恢复 --------------------------- */

  function markPowerRestored(): { ok: boolean; error?: string } {
    if (state.value.outage?.phase !== "ACTIVE") {
      return { ok: false, error: "当前停电事件不在停电中状态" };
    }
    commit(() => {
      state.value.outage!.phase = "POWER_RESTORED";
      state.value.outage!.powerRestoredAt = nowIso();
    });
    return { ok: true };
  }

  function setSelfCheck(passed: boolean) {
    const event = state.value.outage;
    if (!event || event.phase !== "POWER_RESTORED") return;
    commit(() => {
      event.deviceSelfCheckPassed = passed;
      event.deviceSelfCheckAt = passed ? nowIso() : null;
    });
  }

  function setGunReset(passed: boolean) {
    const event = state.value.outage;
    if (!event || event.phase !== "POWER_RESTORED") return;
    commit(() => {
      event.gunResetPassed = passed;
      event.gunResetAt = passed ? nowIso() : null;
    });
  }

  /** 双检通过且无未处理纸单 → 确认恢复营业，确认即冻结 */
  function resume(): { ok: boolean; error?: string; blockers?: string[] } {
    const result = checkResume(state.value);
    if (!result.ok) {
      return { ok: false, error: "恢复营业条件未满足", blockers: result.blockers };
    }
    commit(() => {
      const event = state.value.outage!;
      event.phase = "RESUMED";
      event.resumedAt = nowIso();
      event.frozen = true;
    });
    return { ok: true };
  }

  /* -------------------------------- 班次 -------------------------------- */

  /** 未处理完不能关班；写交班原因后由下一班承接 */
  function handover(reason: string, nextName: string, nextOperator: string): { ok: boolean; error?: string } {
    const shift = currentShift.value;
    if (!shift) return { ok: false, error: "当前没有进行中的班次" };
    if (!handoverReasonValid(reason)) return { ok: false, error: "请填写不少于 5 个字的交班原因" };
    if (!nextName.trim()) return { ok: false, error: "请选择下一班班次" };
    if (!nextOperator.trim()) return { ok: false, error: "请填写接班人员" };

    const info = checkCloseShift(state.value, shift);
    if (info.ok) {
      return { ok: false, error: "全部事项已处理完，请直接正常关班，无需交班承接" };
    }

    commit(() => {
      shift.closedAt = nowIso();
      shift.closeReason = reason.trim();
      const nextSeq = state.value.shifts.reduce((m, s) => Math.max(m, s.seq), 0) + 1;
      const next: Shift = {
        id: uid("shift"),
        seq: nextSeq,
        name: nextName.trim(),
        openedAt: nowIso(),
        openedBy: nextOperator.trim(),
        closedAt: null,
        closeReason: null,
        carriedFromShiftId: shift.id
      };
      state.value.shifts.push(next);
      state.value.operator = nextOperator.trim();
    });
    return { ok: true };
  }

  function closeShift(): { ok: boolean; error?: string; blockers?: string[] } {
    const shift = currentShift.value;
    if (!shift) return { ok: false, error: "当前没有进行中的班次" };
    const info = checkCloseShift(state.value, shift);
    if (!info.ok) {
      return { ok: false, error: "尚有未处理事项，不能关班（可写交班原因由下一班承接）", blockers: info.blockers };
    }
    commit(() => {
      shift.closedAt = nowIso();
      shift.closeReason = null;
    });
    return { ok: true };
  }

  function resetDemo() {
    state.value = resetState();
  }

  return {
    state,
    outage,
    entries,
    receipts,
    corrections,
    shifts,
    currentShift,
    summary,
    resumeInfo,
    closeInfo,
    candidatesFor,
    setOperator,
    registerOutage,
    addEntry,
    updateEntry,
    addReceipt,
    tryReconcile,
    markPowerRestored,
    setSelfCheck,
    setGunReset,
    resume,
    handover,
    closeShift,
    resetDemo
  };
});

export { eqAmount, eqLiters };
