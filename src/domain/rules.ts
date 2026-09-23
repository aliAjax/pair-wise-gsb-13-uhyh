/**
 * 判定层：停电应急加油台的全部业务规则（纯函数）。
 * 不读写 localStorage、不引用 Vue，输入数据输出结果，方便单测。
 */
import type {
  CorrectionVersion,
  ManualRecord,
  OutageEvent,
  RecordStatus,
  TerminalReceipt
} from "../data/types";

export interface ValidationResult {
  valid: boolean;
  errors: Partial<Record<string, string>>;
}

const PLATE_TAIL_RE = /^[0-9A-Za-z]{3}$/;

/** 纸单号是否落在登记范围内（按数字段比较，前缀字母忽略） */
export function slipInRange(slipNo: string, from: string, to: string): boolean {
  const num = (s: string) => Number(s.replace(/[^0-9]/g, ""));
  const n = num(slipNo);
  const lo = num(from);
  const hi = num(to);
  if ([n, lo, hi].some((v) => Number.isNaN(v))) return false;
  return n >= lo && n <= hi;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** 手工加油录入校验 */
export function validateManualInput(
  input: { plateTail: string; nozzle: string; liters: number | null; amount: number | null; payment: number | null; slipNo: string },
  event: Pick<OutageEvent, "affectedNozzles" | "slipFrom" | "slipTo">
): ValidationResult {
  const errors: ValidationResult["errors"] = {};

  if (!PLATE_TAIL_RE.test(input.plateTail.trim())) {
    errors.plateTail = "车牌后三位须为 3 位字母或数字";
  }
  if (!input.nozzle) {
    errors.nozzle = "请选择枪号";
  } else if (!event.affectedNozzles.includes(input.nozzle)) {
    errors.nozzle = "枪号不在受影响油枪清单内";
  }
  if (input.liters === null || input.liters <= 0) {
    errors.liters = "升数须大于 0";
  }
  if (input.amount === null || input.amount <= 0) {
    errors.amount = "金额须大于 0";
  }
  // 收款允许空缺（空缺 → 待补录），但若填写须为正数
  if (input.payment !== null && input.payment <= 0) {
    errors.payment = "收款须大于 0，或留空待补录";
  }
  if (!input.slipNo.trim()) {
    errors.slipNo = "请填写纸单号";
  } else if (!slipInRange(input.slipNo.trim(), event.slipFrom, event.slipTo)) {
    errors.slipNo = `单号须在 ${event.slipFrom} ~ ${event.slipTo} 范围内`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** 停电事件建档校验：受影响油枪、开始时刻、单号范围缺一不可 */
export function validateEventDraft(draft: {
  affectedNozzles: string[];
  startedAt: string;
  slipFrom: string;
  slipTo: string;
}): ValidationResult {
  const errors: ValidationResult["errors"] = {};
  if (draft.affectedNozzles.length === 0) errors.affectedNozzles = "至少登记一把受影响油枪";
  if (!draft.startedAt) errors.startedAt = "请记录停电开始时刻";
  if (!draft.slipFrom.trim() || !draft.slipTo.trim()) {
    errors.slipRange = "请填写纸单号起止范围";
  } else {
    const num = (s: string) => Number(s.replace(/[^0-9]/g, ""));
    if (num(draft.slipTo) < num(draft.slipFrom)) errors.slipRange = "止号不能小于起号";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * 判定手工单的初始/复核状态：
 * 收款空缺或单号重复 → 待补录（先留待补录，不参与核销）；
 * 否则 → 待匹配。
 */
export function classifyRecord(
  candidate: { slipNo: string; payment: number | null; id?: string },
  siblings: ManualRecord[]
): { status: RecordStatus; reasons: ManualRecord["pendingReasons"] } {
  const reasons: ManualRecord["pendingReasons"] = [];
  if (candidate.payment === null) reasons.push("收款空缺");
  const duplicated = siblings.some(
    (r) => r.id !== candidate.id && r.status !== "无小票" && effectiveSlipNo(r) === candidate.slipNo
  );
  if (duplicated) reasons.push("单号重复");
  return reasons.length > 0
    ? { status: "待补录", reasons }
    : { status: "待匹配", reasons: [] };
}

/** 应用更正版本后，当前生效的纸单号 */
function effectiveSlipNo(r: ManualRecord): string {
  const last = r.corrections[r.corrections.length - 1];
  return last?.patch.slipNo ?? r.slipNo;
}

/** 应用全部更正版本后的有效值（更正只追加，不改原始记录） */
export function effectiveRecord(r: ManualRecord): ManualRecord {
  if (r.corrections.length === 0) return r;
  const merged = { ...r };
  for (const c of r.corrections) Object.assign(merged, c.patch);
  return merged;
}

export interface MatchResult {
  status: RecordStatus;
  matchedReceipt?: string;
  diffNote?: string;
}

/**
 * 复电后匹配终端小票：
 * 按单号匹配；金额不符 → “金额不符”，禁止核销；
 * 一致 → 已核销；查无小票 → 无小票（转回人工处理）。
 */
export function matchWithReceipt(
  record: ManualRecord,
  receipts: TerminalReceipt[]
): MatchResult {
  if (record.status === "待补录") return { status: "待补录" };
  const eff = effectiveRecord(record);
  const receipt = receipts.find(
    (rc) => !rc.matched && rc.slipNo === eff.slipNo
  );
  if (!receipt) return { status: "无小票", diffNote: `终端未查到单号 ${eff.slipNo} 的小票` };
  if (round2(receipt.amount) !== round2(eff.amount)) {
    return {
      status: "金额不符",
      matchedReceipt: receipt.slipNo,
      diffNote: `纸单金额 ${eff.amount.toFixed(2)} 与终端 ${receipt.amount.toFixed(2)} 不符，不得核销`
    };
  }
  return { status: "已核销", matchedReceipt: receipt.slipNo };
}

/** 未处理完的手工单：除“已核销”外都算未闭环（含金额不符、无小票、待补录、待匹配） */
export function unfinishedRecords(event: OutageEvent): ManualRecord[] {
  return event.records.filter((r) => effectiveRecord(r).status !== "已核销");
}

/** 关班规则：有任何未处理完的单 → 不能关班 */
export function canCloseShift(event: OutageEvent): boolean {
  return unfinishedRecords(event).length === 0;
}

/** 恢复营业规则：设备自检 + 油枪复位双双通过才允许恢复 */
export function canResumeBusiness(event: OutageEvent): boolean {
  return event.stage === "已复电" && event.selfCheckPassed && event.nozzleResetPassed;
}

/** 是否冻结：确认恢复营业后整单冻结，只能查看/另建更正版本 */
export function isFrozen(event: OutageEvent): boolean {
  return event.resumedAt !== null;
}

/** 汇总指标 */
export function summarize(event: OutageEvent) {
  const eff = event.records.map(effectiveRecord);
  return {
    total: eff.length,
    pending: eff.filter((r) => r.status === "待补录").length,
    verified: eff.filter((r) => r.status === "已核销").length,
    diff: eff.filter((r) => r.status === "金额不符").length,
    unmatched: eff.filter((r) => r.status === "无小票" || r.status === "待匹配").length,
    liters: round2(eff.filter((r) => r.status === "已核销").reduce((s, r) => s + r.liters, 0)),
    cash: round2(
      eff.filter((r) => r.status === "已核销").reduce((s, r) => s + (r.payment ?? 0), 0)
    )
  };
}

/** 新建一条追加式更正版本 */
export function buildCorrection(input: {
  slipNo: string;
  reason: string;
  patch: CorrectionVersion["patch"];
  operator: string;
}): CorrectionVersion {
  return {
    id: crypto.randomUUID(),
    slipNo: input.slipNo,
    reason: input.reason,
    patch: input.patch,
    operator: input.operator,
    createdAt: new Date().toISOString()
  };
}
