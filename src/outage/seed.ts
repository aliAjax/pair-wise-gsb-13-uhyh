import type { OutageState } from "./types";

/**
 * 首次使用时的演示数据：台风夜停电，受影响 3、4 号枪，
 * 复电后终端补传小票，部分纸单尚待核销，便于直接走查完整流程。
 */
export function createSeedState(): OutageState {
  const openedAt = "2026-09-21T22:10:00.000Z";
  return {
    version: 1,
    operator: "值班员 林海",
    outage: {
      id: "out-seed-1",
      phase: "POWER_RESTORED",
      affectedGuns: ["3", "4"],
      startedAt: "2026-09-21T22:15:00.000Z",
      paperStart: "P20260921-1001",
      paperEnd: "P20260921-1020",
      powerRestoredAt: "2026-09-22T01:40:00.000Z",
      deviceSelfCheckPassed: false,
      deviceSelfCheckAt: null,
      gunResetPassed: false,
      gunResetAt: null,
      resumedAt: null,
      frozen: false
    },
    shifts: [
      {
        id: "shift-seed-1",
        seq: 1,
        name: "夜班",
        openedAt,
        openedBy: "林海",
        closedAt: null,
        closeReason: null,
        carriedFromShiftId: null
      }
    ],
    entries: [
      {
        id: "entry-seed-1",
        createdAt: "2026-09-21T22:40:00.000Z",
        shiftId: "shift-seed-1",
        plateTail: "8A3",
        gunNo: "3",
        liters: 32.5,
        amount: 260,
        paperNo: "P20260921-1001",
        status: "RECONCILED",
        holdReasons: [],
        warnings: [],
        remark: "",
        supplementNote: null,
        supplementAt: null,
        reconciledAt: "2026-09-22T01:52:00.000Z",
        receiptId: "rcpt-seed-1",
        lastMatchNote: "小票一致，已核销"
      },
      {
        id: "entry-seed-2",
        createdAt: "2026-09-21T23:05:00.000Z",
        shiftId: "shift-seed-1",
        plateTail: "56F",
        gunNo: "4",
        liters: 40,
        amount: 318,
        paperNo: "P20260921-1002",
        status: "PENDING_RECONCILE",
        holdReasons: [],
        warnings: [],
        remark: "车主急着走，当面点清现金",
        supplementNote: null,
        supplementAt: null,
        reconciledAt: null,
        receiptId: null,
        lastMatchNote: null
      },
      {
        id: "entry-seed-3",
        createdAt: "2026-09-21T23:30:00.000Z",
        shiftId: "shift-seed-1",
        plateTail: "K20",
        gunNo: "3",
        liters: 20,
        amount: null,
        paperNo: "P20260921-1003",
        status: "PENDING_SUPPLEMENT",
        holdReasons: ["收款空缺"],
        warnings: [],
        remark: "扫码支付终端无信号，金额待补",
        supplementNote: null,
        supplementAt: null,
        reconciledAt: null,
        receiptId: null,
        lastMatchNote: null
      },
      {
        id: "entry-seed-4",
        createdAt: "2026-09-22T00:10:00.000Z",
        shiftId: "shift-seed-1",
        plateTail: "77D",
        gunNo: "4",
        liters: 15,
        amount: 120,
        paperNo: "P20260921-1002",
        status: "PENDING_SUPPLEMENT",
        holdReasons: ["重复单号"],
        warnings: [],
        remark: "复写纸单用重号，待与小票核对真实单号",
        supplementNote: null,
        supplementAt: null,
        reconciledAt: null,
        receiptId: null,
        lastMatchNote: null
      }
    ],
    receipts: [
      {
        id: "rcpt-seed-1",
        createdAt: "2026-09-21T22:41:00.000Z",
        gunNo: "3",
        plateTail: "8A3",
        liters: 32.5,
        amount: 260,
        used: true,
        matchedEntryId: "entry-seed-1"
      },
      {
        id: "rcpt-seed-2",
        createdAt: "2026-09-21T23:06:00.000Z",
        gunNo: "4",
        plateTail: "56F",
        liters: 40,
        amount: 318,
        used: false,
        matchedEntryId: null
      },
      {
        id: "rcpt-seed-3",
        createdAt: "2026-09-21T23:31:00.000Z",
        gunNo: "3",
        plateTail: "K20",
        liters: 20,
        amount: 159,
        used: false,
        matchedEntryId: null
      }
    ],
    corrections: []
  };
}
