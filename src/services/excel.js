import ExcelJS from 'exceljs';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config.js';

class ExcelService {
  constructor() {
    this.templatesDir = config.templatesDir;
  }

  async init() {
    await fs.ensureDir(this.templatesDir);
  }

  async exportDataToExcel(dataList) {
    const workbook = new ExcelJS.Workbook();

    // Group data by category
    const grouped = {};
    for (const item of dataList) {
      const category = item.category || 'general';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(item);
    }

    // Style helpers
    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      },
      alignment: { horizontal: 'center', vertical: 'middle' }
    };

    const borderStyle = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    // Create sheet for each category
    for (const [category, items] of Object.entries(grouped)) {
      const worksheet = workbook.addWorksheet(this.capitalizeFirst(category));

      // Get all unique keys from data
      const allKeys = new Set();
      for (const item of items) {
        if (item.data && typeof item.data === 'object') {
          Object.keys(item.data).forEach(k => allKeys.add(k));
        }
      }

      const fields = Array.from(allKeys);

      // Add headers
      const headerRow = worksheet.addRow(['No.', 'Timestamp', 'Version', ...fields]);
      headerRow.eachCell(cell => {
        cell.style = headerStyle;
        cell.border = borderStyle;
      });

      // Set column widths
      worksheet.getColumn(1).width = 5;
      worksheet.getColumn(2).width = 20;
      worksheet.getColumn(3).width = 10;
      fields.forEach((_, i) => {
        worksheet.getColumn(i + 4).width = 20;
      });

      // Add data rows
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const rowData = [
          i + 1,
          new Date(item.timestamp).toLocaleString('id-ID'),
          item.version || 1
        ];

        for (const field of fields) {
          const value = item.data?.[field];
          rowData.push(this.formatValue(value, field));
        }

        const row = worksheet.addRow(rowData);
        row.eachCell(cell => {
          cell.border = borderStyle;
        });
      }
    }

    // Add summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['Category', 'Total Records', 'Latest Update']);
    summarySheet.getRow(1).eachCell(cell => {
      cell.style = headerStyle;
      cell.border = borderStyle;
    });

    for (const [category, items] of Object.entries(grouped)) {
      const latest = items.reduce((max, item) =>
        new Date(item.timestamp) > new Date(max.timestamp) ? item : max
      , items[0]);

      summarySheet.addRow([
        this.capitalizeFirst(category),
        items.length,
        new Date(latest.timestamp).toLocaleString('id-ID')
      ]);
    }

    summarySheet.getColumn(1).width = 20;
    summarySheet.getColumn(2).width = 15;
    summarySheet.getColumn(3).width = 25;

    return workbook;
  }

  async exportWithTemplate(dataList, template) {
    const workbook = new ExcelJS.Workbook();

    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      },
      alignment: { horizontal: 'center', vertical: 'middle' }
    };

    const borderStyle = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    for (const sheetConfig of template.sheets || []) {
      const worksheet = workbook.addWorksheet(sheetConfig.name || 'Sheet');

      // Get fields from template
      const fields = sheetConfig.fields || [];
      const dataKey = sheetConfig.dataKey;

      // Add headers
      const headers = ['No.', ...fields.map(f => f.header)];
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell(cell => {
        cell.style = headerStyle;
        cell.border = borderStyle;
      });

      // Set column widths
      worksheet.getColumn(1).width = 5;
      fields.forEach((field, i) => {
        worksheet.getColumn(i + 2).width = field.width || 20;
      });

      // Filter data for this sheet
      const sheetData = dataList.filter(d => d.category === dataKey);

      // Add data rows
      for (let i = 0; i < sheetData.length; i++) {
        const item = sheetData[i].data;
        const rowData = [i + 1];

        for (const field of fields) {
          const value = item?.[field.key];
          rowData.push(this.formatValue(value, field));
        }

        const row = worksheet.addRow(rowData);
        row.eachCell(cell => {
          cell.border = borderStyle;
        });
      }
    }

    return workbook;
  }

  formatValue(value, field) {
    if (value === null || value === undefined) return '';

    if (field?.type === 'currency') {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR'
      }).format(value);
    }

    if (field?.type === 'date' && value) {
      return new Date(value).toLocaleDateString('id-ID');
    }

    return String(value);
  }

  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

export const excelService = new ExcelService();
