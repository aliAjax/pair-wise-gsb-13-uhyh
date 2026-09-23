/**
 * 停电应急加油台 —— 判定层
 * 全部为纯函数：只根据传入数据给出结论（阻断码 / 留待原因 / 提示），
 * 不读写 localStorage、不依赖页面。
 */
import type {
  EntryDraft,
  ManualEntry,
  OutageEvent,
  OutageState,
  Shift,
  TerminalReceipt
} from "./types";

/* ------------------------------ 判定常量 ------------------------------ */

/** 留待补录原因（阻断手工单进入核销） */
export const HOLD_DUPLICATE = "重复单号";
export const HOLD_AMOUNT_MISSING = "收款空缺";

/** 非阻断性提示 */
export const WARN_OUT_OF_RANGE = "单号超出纸单号范围";
export const WARN_GUN_NOT_AFFECTED = "枪号不在受影响油枪名单";
export const WARN_LITERS_INVALID = "升数必须大于 0";

/** 核销结论码 */
export type ReconcileCode =
  | "OK"
  | "ENTRY_NOT_READY"
  | "RECEIPT_USED"
  | "KEY_MISMATCH"
  | "LITERS_MISMATCH"
  | "AMOUNT_MISMATCH";

/** 关班阻断码 */
export type CloseBlocker =
  | "SHIFT_NOT_OPEN"
  | "OUTAGE_NOT_RESUMED"
  | "PENDING_ENTRIES";

/** 恢复营业阻断码 */
export type ResumeBlocker =
  | "PHASE_WRONG"
  | "SELF_CHECK_NOT_PASSED"
  | "GUN_RESET_NOT_PASSED"
  | "PENDING_ENTRIES";

/* ------------------------------ 基础工具 ------------------------------ */

export function normText(value: string): string {
  return value.trim().toUpperCase();
}

export function eqLiters(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

export function eqAmount(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/** 解析纸单号：前缀 + 末尾连续数字序号，如 P20260921-1001 → (P20260921-100, 1) */
export function parsePaperNo(no: string): { prefix: string; seq: number } | null {
  const m = /^(.*?)(\d+)$/.exec(no.trim());
  if (!m) return null;
  return { prefix: m[1], seq: parseInt(m[2], 10) };
}

/** 登记时校验纸单号范围：同前缀且起止序号递增 */
export function paperRangeValid(start: string, end: string): boolean {
  const s = parsePaperNo(start);
  const e = parsePaperNo(end);
  if (!s || !e) return false;
  return s.prefix === e.prefix && e.seq >= s.seq;
}

/** 单号是否落在登记范围内（仅作提示，不阻断录入） */
export function inPaperRange(no: string, event: OutageEvent): boolean {
  const target = parsePaperNo(no);
  const s = parsePaperNo(event.paperStart);
  const e = parsePaperNo(event.paperEnd);
  if (!target || !s || !e) return true;
  return target.prefix === s.prefix && target.seq >= s.seq && target.seq <= e.seq;
}

export function isAffectedGun(gunNo: string, event: OutageEvent): boolean {
  return event.affectedGuns.includes(gunNo.trim());
}

/* --------------------------- 手工单录入判定 --------------------------- */

export interface EntryCheckResult {
  /** 阻断项：存在则先留待补录，不得进入核销 */
  holdReasons: string[];
  /** 非阻断提示 */
  warnings: string[];
}

/**
 * 评估一条手工加油单：
 * - 重复单号、收款空缺 → 留待补录
 * - 单号超范围、枪号不在受影响名单、升数非法 → 仅提示
 */
export function evaluateEntry(
  draft: Pick<EntryDraft, "paperNo" | "amount" | "gunNo" | "liters">,
  others: ManualEntry[],
  event: OutageEvent
): EntryCheckResult {
  const holdReasons: string[] = [];
  const warnings: string[] = [];

  const paperNo = draft.paperNo.trim();
  if (others.some((o) => o.paperNo.trim() === paperNo)) {
    holdReasons.push(HOLD_DUPLICATE);
  }
  if (draft.amount === null || draft.amount === undefined || Number.isNaN(draft.amount)) {
    holdReasons.push(HOLD_AMOUNT_MISSING);
  }
  if (draft.liters === null || draft.liters === undefined || draft.liters <= 0) {
    warnings.push(WARN_LITERS_INVALID);
  }
  if (!inPaperRange(paperNo, event)) {
    warnings.push(WARN_OUT_OF_RANGE);
  }
  if (!isAffectedGun(draft.gunNo, event)) {
    warnings.push(WARN_GUN_NOT_AFFECTED);
  }
  return { holdReasons, warnings };
}

/* ----------------------------- 小票核销判定 ----------------------------- */

export interface ReconcileResult {
  ok: boolean;
  code: ReconcileCode;
  detail: string;
}

/**
 * 复电后匹配终端小票：
 * 枪号、车牌后三位为匹配主键；升数、金额必须一致。
 * 金额不符 → AMOUNT_MISMATCH，手工单置为“金额不符”，不得核销，小票不被占用。
 */
export function reconcile(
  entry: ManualEntry,
  receipt: TerminalReceipt
): ReconcileResult {
  if (entry.status !== "PENDING_RECONCILE" && entry.status !== "MISMATCH") {
    return { ok: false, code: "ENTRY_NOT_READY", detail: "该纸单尚不可核销（留待补录或已核销）" };
  }
  if (receipt.used) {
    return { ok: false, code: "RECEIPT_USED", detail: "该终端小票已被占用" };
  }
  if (normText(entry.gunNo) !== normText(receipt.gunNo) ||
      normText(entry.plateTail) !== normText(receipt.plateTail)) {
    return { ok: false, code: "KEY_MISMATCH", detail: "枪号或车牌后三位不一致" };
  }
  if (!eqLiters(entry.liters, receipt.liters)) {
    return { ok: false, code: "LITERS_MISMATCH", detail: `升数不符：纸单 ${entry.liters}L / 小票 ${receipt.liters}L` };
  }
  if (entry.amount === null || !eqAmount(entry.amount, receipt.amount)) {
    const paper = entry.amount === null ? "空缺" : `${entry.amount} 元`;
    return {
      ok: false,
      code: "AMOUNT_MISMATCH",
      detail: `金额不符：纸单 ${paper} / 小票 ${receipt.amount} 元，不得核销`
    };
  }
  return { ok: true, code: "OK", detail: "单号、升数、金额一致，准予核销" };
}

/** 为纸单推荐小票候选，匹配度高的在前 */
export function rankReceipts(entry: ManualEntry, receipts: TerminalReceipt[]): TerminalReceipt[] {
  const score = (r: TerminalReceipt): number => {
    let s = 0;
    if (normText(r.gunNo) === normText(entry.gunNo)) s += 2;
    if (normText(r.plateTail) === normText(entry.plateTail)) s += 2;
    if (eqLiters(r.liters, entry.liters)) s += 1;
    if (entry.amount !== null && eqAmount(r.amount, entry.amount)) s += 1;
    return s;
  };
  return receipts
    .filter((r) => !r.used)
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s >= 4)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r);
}

/* ------------------------------ 班次判定 ------------------------------ */

/** 沿交班承接链回溯出本班次承接范围内的全部班次 */
export function shiftChain(state: OutageState, shift: Shift): Shift[] {
  const byId = new Map(state.shifts.map((s) => [s.id, s]));
  const chain: Shift[] = [];
  let cur: Shift | undefined = shift;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    chain.push(cur);
    cur = cur.carriedFromShiftId ? byId.get(cur.carriedFromShiftId) : undefined;
  }
  return chain;
}

export function activeShift(state: OutageState): Shift | null {
  return state.shifts.find((s) => s.closedAt === null) ?? null;
}

export function pendingEntries(state: OutageState, shift: Shift): ManualEntry[] {
  const ids = new Set(shiftChain(state, shift).map((s) => s.id));
  return state.entries.filter(
    (e) => ids.has(e.shiftId) && e.status !== "RECONCILED"
  );
}

/** 关班前检查：停电事件未恢复营业、或承接范围内有未处理完纸单，均不得关班 */
export function checkCloseShift(
  state: OutageState,
  shift: Shift
): { ok: boolean; blockers: CloseBlocker[]; pendingCount: number } {
  const blockers: CloseBlocker[] = [];
  if (shift.closedAt !== null) blockers.push("SHIFT_NOT_OPEN");
  if (state.outage && state.outage.phase !== "RESUMED") blockers.push("OUTAGE_NOT_RESUMED");
  const pending = pendingEntries(state, shift);
  if (pending.length > 0) blockers.push("PENDING_ENTRIES");
  return { ok: blockers.length === 0, blockers, pendingCount: pending.length };
}

/* ---------------------------- 恢复营业判定 ---------------------------- */

/** 设备自检 + 油枪复位双通过，且全部纸单核销完毕，方可确认恢复营业（确认即冻结） */
export function checkResume(state: OutageState): { ok: boolean; blockers: ResumeBlocker[] } {
  const blockers: ResumeBlocker[] = [];
  const outage = state.outage;
  if (!outage || outage.phase !== "POWER_RESTORED") blockers.push("PHASE_WRONG");
  if (!outage?.deviceSelfCheckPassed) blockers.push("SELF_CHECK_NOT_PASSED");
  if (!outage?.gunResetPassed) blockers.push("GUN_RESET_NOT_PASSED");
  if (state.entries.some((e) => e.status !== "RECONCILED")) blockers.push("PENDING_ENTRIES");
  return { ok: blockers.length === 0, blockers };
}

/** 交班原因必填，否则下一班无法承接 */
export function handoverReasonValid(reason: string): boolean {
  return reason.trim().length >= 5;
}

/** 冻结后仅允许“原因版本”式更正 */
export function isFrozen(state: OutageState): boolean {
  return state.outage?.frozen === true;
}
