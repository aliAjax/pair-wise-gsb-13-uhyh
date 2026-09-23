/**
 * 停电应急加油台 —— 页面层（展示辅助）
 * 只做状态文案、时间格式化等纯展示用途。
 */
import type { EntryStatus, OutagePhase } from "./types";
import type { CloseBlocker, ResumeBlocker } from "./rules";

export const ENTRY_STATUS_META: Record<
  EntryStatus,
  { label: string; type: "warning" | "primary" | "success" | "danger" }
> = {
  PENDING_SUPPLEMENT: { label: "待补录", type: "warning" },
  PENDING_RECONCILE: { label: "待核销", type: "primary" },
  RECONCILED: { label: "已核销", type: "success" },
  MISMATCH: { label: "金额不符", type: "danger" }
};

export const PHASE_META: Record<
  OutagePhase,
  { label: string; type: "info" | "warning" | "success" | "danger" }
> = {
  ACTIVE: { label: "停电中 · 手工加油", type: "danger" },
  POWER_RESTORED: { label: "已复电 · 待核销", type: "warning" },
  RESUMED: { label: "已恢复营业 · 数据冻结", type: "success" }
};

export const RESUME_BLOCKER_TEXT: Record<ResumeBlocker, string> = {
  PHASE_WRONG: "停电事件阶段不正确",
  SELF_CHECK_NOT_PASSED: "设备自检尚未通过",
  GUN_RESET_NOT_PASSED: "油枪复位尚未通过",
  PENDING_ENTRIES: "仍有未核销 / 金额不符 / 待补录纸单"
};

export const CLOSE_BLOCKER_TEXT: Record<CloseBlocker, string> = {
  SHIFT_NOT_OPEN: "班次已关闭",
  OUTAGE_NOT_RESUMED: "停电事件尚未恢复营业",
  PENDING_ENTRIES: "承接范围内仍有未处理完的纸单"
};

export const FIELD_LABELS: Record<string, string> = {
  plateTail: "车牌后三位",
  gunNo: "枪号",
  liters: "升数",
  amount: "收款金额",
  paperNo: "纸单号"
};

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** ISO → 本地可读时间 */
export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 当前时刻的 datetime-local 值 */
export function nowLocalInput(): string {
  return toLocalInput(new Date());
}

export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function yuan(v: number | null): string {
  return v === null ? "空缺" : `${Number(v).toFixed(2)} 元`;
}
