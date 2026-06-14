import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.resolve("backend/templates");
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("客户导入模板");
sheet.showGridLines = false;

const headers = [
  "客户",
  "客户电话",
  "城市",
  "客户地址",
  "渠道来源",
  "意向产品",
  "单位",
  "录入人",
  "跟进人",
  "跟进记录",
  "最新跟进时间",
  "下次跟进时间",
  "当前使用软件",
  "预计金额（元）"
];

sheet.getRange("A1:N5").values = [
  headers,
  ["杭州雅居全屋定制工厂", "13800138000", "杭州市", "浙江省杭州市余杭区示例路88号", "企查查", "V1", "杭州一部", "运营小组", "张销售", "已电话联系，老板关注设计拆单一体化", "2026-06-14", "2026-06-16", "三维家", 150000],
  ["佛山柜体门板厂", "13900139000", "佛山市", "广东省佛山市顺德区示例工业园", "地推", "ERP", "佛山一部", "运营小组", "李销售", "准备安排现场演示", "2026-06-14", "2026-06-18", "云熙", 260000],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", ""]
];

sheet.getRange("A1:N1").format = {
  fill: "#1F2D3D",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  borders: { preset: "all", style: "thin", color: "#D8E2EC" },
  rowHeight: 30
};
sheet.getRange("A2:N1000").format = {
  borders: { preset: "all", style: "thin", color: "#E4E9F0" },
  verticalAlignment: "center"
};
sheet.getRange("B2:B1000").format.numberFormat = "@";
sheet.getRange("K2:L1000").format.numberFormat = "yyyy-mm-dd";
sheet.getRange("N2:N1000").format.numberFormat = "¥#,##0.00";
sheet.getRange("A2:N3").format.fill = "#F7FAFC";
sheet.getRange("A:A").format.columnWidth = 28;
sheet.getRange("B:B").format.columnWidth = 17;
sheet.getRange("C:C").format.columnWidth = 13;
sheet.getRange("D:D").format.columnWidth = 34;
sheet.getRange("E:F").format.columnWidth = 15;
sheet.getRange("G:I").format.columnWidth = 16;
sheet.getRange("J:J").format.columnWidth = 38;
sheet.getRange("K:L").format.columnWidth = 17;
sheet.getRange("M:M").format.columnWidth = 18;
sheet.getRange("N:N").format.columnWidth = 18;
sheet.getRange("D2:D1000").format.wrapText = true;
sheet.getRange("J2:J1000").format.wrapText = true;
sheet.freezePanes.freezeRows(1);

const guide = workbook.worksheets.add("填写说明");
guide.showGridLines = false;
guide.getRange("A1:D1").merge();
guide.getRange("A1").values = [["智销AI客户与公海导入说明"]];
guide.getRange("A1:D1").format = {
  fill: "#409EFF",
  font: { bold: true, color: "#FFFFFF", size: 16 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  rowHeight: 34
};
guide.getRange("A3:B18").values = [
  ["字段", "填写规则"],
  ["客户", "必填，填写工厂完整名称。"],
  ["客户电话", "必填，主联系人手机号；全系统唯一，重复客户会跳过并出现在未导入明细中。"],
  ["城市", "建议填写，如留空系统会优先从客户地址中提取。"],
  ["客户地址", "建议填写完整省市区和街道；导入公海时必填，用于地图生成待拜访灰点。"],
  ["渠道来源", "可填：自媒体、官网留言、自主注册、渠道介绍、企查查、客源汇、公众号、地推、其他。"],
  ["意向产品", "可填：V1、V3升级、ERP、渲染软件、其他；系统设置中新增的产品也可直接填写。"],
  ["单位", "普通名单导入可填写；最终负责人和单位仍以后端权限与导入设置为准。"],
  ["录入人", "可选，留空时自动记录当前导入账号。"],
  ["跟进人", "可选，销售账号导入时自动使用本人；主管以上以导入时选择的负责人为准。"],
  ["跟进记录", "可选，导入记录属于系统初始化记录，不作为人工有效跟进。"],
  ["最新跟进时间", "可选，格式 yyyy-mm-dd。"],
  ["下次跟进时间", "可选，格式 yyyy-mm-dd。"],
  ["当前使用软件", "可选，系统会自动写入客户的主要竞品档案，不需要重复维护。"],
  ["预计金额（元）", "可选，统一填写人民币元，例如填写150000；旧模板使用旧金额单位时系统会自动换算。"],
  ["已有手机号增购", "已有客户需要创建新机会时，必须明确填写不同的意向产品；同产品进行中机会会跳过。"]
];
guide.getRange("A3:B3").format = { fill: "#1F2D3D", font: { bold: true, color: "#FFFFFF" } };
guide.getRange("A3:B18").format.borders = { preset: "all", style: "thin", color: "#E4E9F0" };
guide.getRange("A4:A18").format.font = { bold: true, color: "#243447" };
guide.getRange("A:A").format.columnWidth = 22;
guide.getRange("B:B").format.columnWidth = 78;
guide.getRange("B4:B18").format.wrapText = true;
guide.freezePanes.freezeRows(3);

const preview = await workbook.render({ sheetName: "客户导入模板", range: "A1:N6", scale: 1.5, format: "png" });
const previewPath = path.join(os.tmpdir(), "zhixiao-customer-import-template-preview.png");
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
const outputPath = path.join(outputDir, "customer-import-template.xlsx");
await output.save(outputPath);

const inspection = await workbook.inspect({ kind: "table", range: "客户导入模板!A1:N5", include: "values,formulas", tableMaxRows: 8, tableMaxCols: 15 });
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "formula error scan" });
console.log(inspection.ndjson);
console.log(errors.ndjson);
console.log(JSON.stringify({ outputPath, previewPath }));
