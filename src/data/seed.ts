/**
 * 数据层：首次启动的演示数据（模拟台风夜停电现场）。
 * 仅用于初始化，业务判定见 domain/rules.ts。
 */
import type { DeskDatabase } from "./types";

export function seedDatabase(): DeskDatabase {
  const now = Date.now();
  const iso = (offsetMin: number) => new Date(now + offsetMin * 60000).toISOString();

  return {
    version: 1,
    activeEventId: "evt-typhoon",
    events: [
      {
        id: "evt-typhoon",
        title: "台风“海燕”停电应急加油",
        affectedNozzles: ["1", "2", "3", "4"],
        startedAt: "2026-09-22T23:40",
        slipFrom: "Z001",
        slipTo: "Z100",
        shift: "夜班",
        restoredAt: null,
        stage: "停电中",
        selfCheckPassed: false,
        selfCheckNote: "",
        nozzleResetPassed: false,
        nozzleResetNote: "",
        resumedAt: null,
        records: [
          {
            id: "rec-1",
            plateTail: "A8F",
            nozzle: "1",
            liters: 30,
            amount: 237,
            payment: 237,
            slipNo: "Z003",
            createdAt: iso(-95),
            status: "待匹配",
            pendingReasons: [],
            corrections: []
          },
          {
            id: "rec-2",
            plateTail: "K27",
            nozzle: "2",
            liters: 45.5,
            amount: 359.45,
            payment: null,
            slipNo: "Z004",
            createdAt: iso(-80),
            status: "待补录",
            pendingReasons: ["收款空缺"],
            corrections: []
          },
          {
            id: "rec-3",
            plateTail: "9M3",
            nozzle: "3",
            liters: 20,
            amount: 158,
            payment: 160,
            slipNo: "Z003",
            createdAt: iso(-60),
            status: "待补录",
            pendingReasons: ["单号重复"],
            diffNote: "与 Z003 首条记录单号重复，须核对纸单原件",
            corrections: []
          }
        ],
        receipts: [],
        handovers: [],
        createdAt: iso(-100)
      }
    ]
  };
}
