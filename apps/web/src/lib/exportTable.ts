import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface ExportColumn {
  header: string
  key: string
}

// Convierte array de objetos a filas usando las columnas definidas
function toRows(data: Record<string, unknown>[], columns: ExportColumn[]) {
  return data.map(row =>
    columns.map(col => {
      const val = row[col.key]
      return val == null ? '' : String(val)
    })
  )
}

export function exportToXLSX(
  filename: string,
  columns: ExportColumn[],
  data: Record<string, unknown>[]
) {
  const headers = columns.map(c => c.header)
  const rows = toRows(data, columns)
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Datos')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export function exportToPDF(
  filename: string,
  title: string,
  columns: ExportColumn[],
  data: Record<string, unknown>[]
) {
  const doc = new jsPDF({ orientation: 'landscape' })
  doc.setFontSize(13)
  doc.text(title, 14, 15)
  doc.setFontSize(8)
  doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, 14, 21)

  autoTable(doc, {
    startY: 26,
    head: [columns.map(c => c.header)],
    body: toRows(data, columns),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  })

  doc.save(`${filename}.pdf`)
}
