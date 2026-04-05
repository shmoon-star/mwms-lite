import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";

export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Products Template");

  worksheet.columns = [
    { header: "sku", key: "sku", width: 18 },
    { header: "product_name", key: "product_name", width: 28 },
    { header: "barcode", key: "barcode", width: 28 },
    { header: "uom", key: "uom", width: 12 },
    { header: "brand", key: "brand", width: 18 },
    { header: "category", key: "category", width: 18 },
    { header: "status", key: "status", width: 14 },
  ];

  worksheet.addRow({
    sku: "SKU001",
    product_name: "Basic Tee",
    barcode: "0880000000001",
    uom: "EA",
    brand: "MUSINSA",
    category: "TOP",
    status: "ACTIVE",
  });

  worksheet.addRow({
    sku: "SKU002",
    product_name: "Denim Pants",
    barcode: "0880000000002",
    uom: "EA",
    brand: "MUSINSA",
    category: "BOTTOM",
    status: "ACTIVE",
  });

  worksheet.getRow(1).font = { bold: true };

  // barcode 컬럼 C를 텍스트 서식으로 지정
  worksheet.getColumn(3).numFmt = "@";
  worksheet.getCell("C2").value = "0880000000001";
  worksheet.getCell("C3").value = "0880000000002";
  worksheet.getCell("C2").numFmt = "@";
  worksheet.getCell("C3").numFmt = "@";

  worksheet.getCell("I1").value = "barcode는 텍스트 형식 유지";
  worksheet.getCell("I1").font = { bold: true };
  worksheet.getCell("I2").value = "UPC/barcode는 숫자 변환 금지";

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="products_template.xlsx"',
    },
  });
}