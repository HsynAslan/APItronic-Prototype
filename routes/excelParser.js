const XLSX = require('xlsx');

// Excel dosyasını yükle
function loadExcel(file) {
    const workbook = XLSX.read(file, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // İlk sayfa
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet, { header: 1 });
}

// Part numaralarını bulacak fonksiyon
function findPartNumberColumn(data) {
    const partNumberKeywords = ['Part No', 'P/N', 'Part Number', 'Part#', 'Part#1'];
    let partNumberColumn = -1;

    const headerRow = data[0]; // İlk satır başlıklar için
    for (let col = 0; col < headerRow.length; col++) {
        if (partNumberKeywords.some(keyword => headerRow[col].toString().includes(keyword))) {
            partNumberColumn = col;
            break;
        }
    }

    return partNumberColumn;
}

module.exports = {
    loadExcel,
    findPartNumberColumn
};
