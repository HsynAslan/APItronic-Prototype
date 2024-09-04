const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'pass123',
    database: 'apitronic_db'
});

db.connect((err) => {
    if (err) {
        console.error('MySQL bağlantı hatası:', err);
    } else {
        console.log('MySQL bağlantısı başarılı!');
    }
});

module.exports = db;
