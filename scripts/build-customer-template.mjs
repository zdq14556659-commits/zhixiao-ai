import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const require = createRequire(import.meta.url);
const JSZip = require(require.resolve("jszip", {
  paths: [
    path.resolve("node_modules/.pnpm/node_modules"),
    path.resolve("node_modules/.pnpm/jszip@3.10.1/node_modules")
  ]
}));

const outputDir = path.resolve("backend/templates");
await fs.mkdir(outputDir, { recursive: true });

const statusOptions = ["名单", "线索", "商机", "成交", "公海"];
const channelOptions = ["自媒体", "官网留言", "自主注册", "渠道介绍", "企查查", "客源汇", "公众号", "地推", "其他"];

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("客户导入模板");
sheet.showGridLines = false;

const headers = [
  "客户",
  "客户电话",
  "状态",
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

sheet.getRange("A1:O5").values = [
  headers,
  ["杭州雅居全屋定制工厂", "13800138000", "名单", "杭州市", "浙江省杭州市余杭区示例路88号", "企查查", "V1", "战区部 / 东部战区 / 杭州一部", "运营小组", "张销售", "已电话联系，老板关注设计拆单一体化", "2026-06-14", "2026-06-16", "三维家", 150000],
  ["佛山柜体门板厂", "13900139000", "公海", "佛山市", "广东省佛山市顺德区示例工业园", "公众号", "ERP", "", "运营小组", "", "自主注册资源，导入公海待认领", "", "", "云熙", 260000],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]
];

sheet.getRange("A1:O1").format = {
  fill: "#1F2D3D",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  borders: { preset: "all", style: "thin", color: "#D8E2EC" },
  rowHeight: 30
};
sheet.getRange("A2:O1000").format = {
  borders: { preset: "all", style: "thin", color: "#E4E9F0" },
  verticalAlignment: "center"
};
sheet.getRange("B2:B1000").format.numberFormat = "@";
sheet.getRange("L2:M1000").format.numberFormat = "yyyy-mm-dd";
sheet.getRange("O2:O1000").format.numberFormat = "¥#,##0.00";
sheet.getRange("A2:O3").format.fill = "#F7FAFC";
sheet.getRange("A:A").format.columnWidth = 28;
sheet.getRange("B:B").format.columnWidth = 17;
sheet.getRange("C:C").format.columnWidth = 12;
sheet.getRange("D:D").format.columnWidth = 13;
sheet.getRange("E:E").format.columnWidth = 34;
sheet.getRange("F:G").format.columnWidth = 15;
sheet.getRange("H:J").format.columnWidth = 18;
sheet.getRange("K:K").format.columnWidth = 38;
sheet.getRange("L:M").format.columnWidth = 17;
sheet.getRange("N:N").format.columnWidth = 18;
sheet.getRange("O:O").format.columnWidth = 18;
sheet.getRange("E2:E1000").format.wrapText = true;
sheet.getRange("K2:K1000").format.wrapText = true;
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
guide.getRange("A3:B19").values = [
  ["字段", "填写规则"],
  ["客户", "必填，填写工厂完整名称。"],
  ["客户电话", "必填，主联系人手机号；全系统唯一，重复客户会跳过并出现在未导入明细中。"],
  ["状态", "可选：名单、线索、商机、成交、公海。为空时按当前导入入口处理；选择公海时不需要默认跟进人。"],
  ["城市", "建议填写；如留空系统会优先从客户地址中提取。"],
  ["客户地址", "建议填写完整省市区和街道；导入公海时必填，用于地图生成待拜访灰点。"],
  ["渠道来源", `可选：${channelOptions.join("、")}。系统设置中新增的渠道也可以直接填写。`],
  ["意向产品", "可填：V1、V3升级、ERP、渲染软件、其他；系统设置中新增的产品也可以直接填写。"],
  ["单位", "普通名单导入可填写；最终跟进人与单位仍以后端权限与导入设置为准。"],
  ["录入人", "可选，留空时自动记录当前导入账号。"],
  ["跟进人", "普通阶段导入建议填写；公海导入可以留空，认领后再生成跟进人。"],
  ["跟进记录", "可选，导入记录属于系统初始化记录，不作为人工有效跟进。"],
  ["最新跟进时间", "可选，格式 yyyy-mm-dd。"],
  ["下次跟进时间", "可选，格式 yyyy-mm-dd。"],
  ["当前使用软件", "可选，系统会自动写入客户的主要竞品档案。"],
  ["预计金额（元）", "可选，统一填写人民币元，例如 150000；旧模板使用万元单位时系统会自动换算。"],
  ["已有手机号增购", "已有客户需要创建新机会时，必须明确填写不同的意向产品；同产品进行中机会会跳过。"]
];
guide.getRange("A3:B3").format = { fill: "#1F2D3D", font: { bold: true, color: "#FFFFFF" } };
guide.getRange("A3:B19").format.borders = { preset: "all", style: "thin", color: "#E4E9F0" };
guide.getRange("A4:A19").format.font = { bold: true, color: "#243447" };
guide.getRange("A:A").format.columnWidth = 22;
guide.getRange("B:B").format.columnWidth = 86;
guide.getRange("B4:B19").format.wrapText = true;
guide.freezePanes.freezeRows(3);

const preview = await workbook.render({ sheetName: "客户导入模板", range: "A1:O6", scale: 1.5, format: "png" });
const previewPath = path.join(os.tmpdir(), "zhixiao-customer-import-template-preview.png");
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
const outputPath = path.join(outputDir, "customer-import-template.xlsx");
await output.save(outputPath);
await addListValidations(outputPath, [
  { range: "C2:C1000", values: statusOptions },
  { range: "F2:F1000", values: channelOptions }
]);

const inspection = await workbook.inspect({ kind: "table", range: "客户导入模板!A1:O5", include: "values,formulas", tableMaxRows: 8, tableMaxCols: 16 });
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "formula error scan" });
console.log(inspection.ndjson);
console.log(errors.ndjson);
console.log(JSON.stringify({ outputPath, previewPath }));

async function addListValidations(filePath, validations) {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const sheetPath = "xl/worksheets/sheet1.xml";
  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) return;
  let xml = await sheetFile.async("string");
  const usesPrefix = /<x:worksheet\b/.test(xml);
  const prefix = usesPrefix ? "x:" : "";
  const validationXml = `<${prefix}dataValidations count="${validations.length}">${validations.map((item) => `
    <${prefix}dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${escapeXml(item.range)}">
      <${prefix}formula1>&quot;${escapeXml(item.values.join(","))}&quot;</${prefix}formula1>
    </${prefix}dataValidation>`).join("")}</${prefix}dataValidations>`;
  const existingPattern = new RegExp(`<${prefix}dataValidations[\\s\\S]*?</${prefix}dataValidations>`);
  if (existingPattern.test(xml)) {
    xml = xml.replace(existingPattern, validationXml);
  } else if (xml.includes(`<${prefix}pageMargins`)) {
    xml = xml.replace(`<${prefix}pageMargins`, `${validationXml}<${prefix}pageMargins`);
  } else {
    xml = xml.replace(`</${prefix}worksheet>`, `${validationXml}</${prefix}worksheet>`);
  }
  zip.file(sheetPath, xml);
  const next = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await fs.writeFile(filePath, next);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
