import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.resolve("backend/templates");
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("员工导入");
sheet.showGridLines = false;
sheet.getRange("A1:E4").values = [
  ["员工姓名", "登录账号（手机号）", "初始密码", "角色", "单位"],
  ["张销售", "13800138000", "123456", "销售", "杭州一部"],
  ["李主管", "13900139000", "123456", "主管", "杭州一部"],
  ["", "", "", "", ""]
];
sheet.getRange("A1:E1").format = {
  fill: "#1F2D3D",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  borders: { preset: "all", style: "thin", color: "#D8E2EC" }
};
sheet.getRange("A2:E50").format = {
  borders: { preset: "all", style: "thin", color: "#E4E9F0" },
  verticalAlignment: "center"
};
sheet.getRange("B2:C50").format.numberFormat = "@";
sheet.getRange("A1:E1").format.rowHeight = 28;
sheet.getRange("A:A").format.columnWidth = 16;
sheet.getRange("B:B").format.columnWidth = 22;
sheet.getRange("C:C").format.columnWidth = 16;
sheet.getRange("D:D").format.columnWidth = 15;
sheet.getRange("E:E").format.columnWidth = 22;
sheet.freezePanes.freezeRows(1);

const guide = workbook.worksheets.add("填写说明");
guide.showGridLines = false;
guide.getRange("A1:D1").merge();
guide.getRange("A1").values = [["智销AI员工批量开通说明"]];
guide.getRange("A1:D1").format = { fill: "#409EFF", font: { bold: true, color: "#FFFFFF", size: 16 }, horizontalAlignment: "center", verticalAlignment: "center" };
guide.getRange("A3:B8").values = [
  ["字段", "填写规则"],
  ["员工姓名", "必填，填写员工真实姓名"],
  ["登录账号（手机号）", "必填，账号不能与系统已有账号重复"],
  ["初始密码", "必填，至少6位；首次登录会提醒员工修改"],
  ["角色", "必填，必须与系统设置中的角色名称完全一致"],
  ["单位", "必填，必须与系统设置中的单位名称完全一致"]
];
guide.getRange("A3:B3").format = { fill: "#1F2D3D", font: { bold: true, color: "#FFFFFF" } };
guide.getRange("A3:B8").format.borders = { preset: "all", style: "thin", color: "#E4E9F0" };
guide.getRange("A:A").format.columnWidth = 22;
guide.getRange("B:B").format.columnWidth = 54;
guide.getRange("B4:B8").format.wrapText = true;

const preview = await workbook.render({ sheetName: "员工导入", range: "A1:E8", scale: 2, format: "png" });
await fs.writeFile(path.join(outputDir, "user-import-template-preview.png"), new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "user-import-template.xlsx"));

const inspection = await workbook.inspect({ kind: "table", range: "员工导入!A1:E4", include: "values,formulas", tableMaxRows: 6, tableMaxCols: 6 });
console.log(inspection.ndjson);
