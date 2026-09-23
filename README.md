# 加油站班次交接 · 停电应急加油台

- 行业：石油
- 技术栈：Vue3、Vite、TypeScript、Element Plus、Pinia
- 启动：`npm install && npm run dev`
- 构建：`npm run build`
- 数据保存在浏览器 localStorage（页面右上角可重置演示数据）

## 停电应急加油台

台风夜停电、加油机与 POS 离线时的应急闭环：

1. **登记停电应急台**：受影响油枪、停电开始时刻、纸单号范围（起/止，同前缀递增）。
2. **手工加油纸单**：车牌后三位、枪号、升数、收款、纸单号；**重复单号或收款空缺自动先留待补录**，
   单号超范围、枪号不在受影响名单仅提示不拦截。
3. **复电后匹配终端小票**：按枪号 + 车牌后三位匹配，升数、金额必须一致；
   **金额不符不得核销**，纸单置“金额不符”，小票不被占用，可核对后改配。
4. **设备自检 + 油枪复位双通过**、且纸单全部核销，才能确认恢复营业；
   **确认即冻结**，之后更正必须填写原因，系统逐字段**另建原因版本**不覆盖历史；
   更正已核销单关键字段会自动撤销核销、释放小票并要求重新匹配。
5. **未处理完不能关班**；可填交班原因，由下一班承接全部待处理纸单，承接链跨班累计判定。

## 分层结构

数据、判定、保存、页面严格分开：

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 数据 | `src/outage/types.ts`、`src/outage/seed.ts` | 类型定义、演示数据，无逻辑 |
| 判定 | `src/outage/rules.ts` | 纯函数：留待原因、核销结论、关班/恢复阻断判定 |
| 保存 | `src/outage/storage.ts` | localStorage 序列化读写 |
| 编排 | `src/outage/store.ts` | Pinia：改状态前调判定、改后调保存 |
| 页面 | `src/outage/OutageView.vue`、`src/outage/components/*` | 仅展示与交互，不直接碰存储 |

## 冒烟脚本

`outage-smoke.ts` 用 esbuild 打包后在 Node 中跑完整判定链路（无需浏览器）：

```bash
node_modules/.bin/esbuild outage-smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/smoke.mjs
node /tmp/smoke.mjs
```
