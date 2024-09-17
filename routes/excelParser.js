const XLSX = require('xlsx');

// Excel dosyasını yükle
function loadExcel(file) {
    try {
        // Excel dosyasını buffer olarak oku
        const workbook = XLSX.read(file, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0]; // İlk sayfanın adını al
        const worksheet = workbook.Sheets[sheetName]; // İlk sayfayı al
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Sayfayı JSON formatına çevir

        console.log("Excel Data:", data); // Excel verisini konsola yazdır
        return data;
    } catch (error) {
        console.error('Excel dosyası yüklenirken hata oluştu:', error);
        throw new Error('Excel dosyası yüklenemedi.');
    }
}

// Part numaralarını bulacak fonksiyon
function findPartNumberColumn(data) {
    const partNumberKeywords = ['Part No', 'P/N', 'Part Number', 'Part#', 'Part#1', 'Parça Numarası'];
    let partNumberColumn = -1;

    const headerRow = data[0]; // İlk satır başlıklar için
    for (let col = 0; col < headerRow.length; col++) {
        if (partNumberKeywords.some(keyword => headerRow[col] && headerRow[col].toString().includes(keyword))) {
            partNumberColumn = col;
            break;
        }
    }

    return partNumberColumn;
}

// Quantity sütununu bulacak fonksiyon
function findQuantityColumn(data) {
    const quantityKeywords = ['Quantity', 'Qty', 'Miktar', 'Adet', 'QTY', "'Quantity", 'Adet Miktarı'];
    let quantityColumn = -1;

    const headerRow = data[0]; // İlk satır başlıklar için
    for (let col = 0; col < headerRow.length; col++) {
        if (quantityKeywords.some(keyword => headerRow[col] && headerRow[col].toString().toLowerCase().includes(keyword.toLowerCase()))) {
            quantityColumn = col;
            break;
        }
    }

    return quantityColumn;
}

// Filtreleme işlemi: Part Number ve Quantity değerlerini filtrele
function filterPartNumbersAndQuantities(data) {
    console.log("Excel Header Row:", data[0]); // Başlık satırını konsola yazdır
    const partNumberColumn = findPartNumberColumn(data);
    const quantityColumn = findQuantityColumn(data);

    if (partNumberColumn === -1 || quantityColumn === -1) {
        console.error('Part number veya quantity sütunları bulunamadı.');
        throw new Error('Part number veya quantity sütunu bulunamadı!');
    }

    // Filtreleme: Part Number ve Quantity sütunlarında boş olmayan satırları alalım
    const filteredData = data.slice(1) // Başlık satırını atlıyoruz
        .filter(row => row[partNumberColumn] && row[quantityColumn]) // Boş olmayanları alıyoruz
        .map(row => ({
            partNumber: row[partNumberColumn].toString().trim(),
            quantity: row[quantityColumn].toString().trim()
        }));

    console.log("Filtered Data:", filteredData); // Filtrelenmiş veriyi konsola yazdır
    return filteredData;
}

module.exports = {
    loadExcel,
    findPartNumberColumn,
    filterPartNumbersAndQuantities,
    findQuantityColumn
};
