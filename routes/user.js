const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Yükleme klasörünü kontrol et ve yoksa oluştur
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Dosya yükleme ayarları
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir); // Dosyaların yükleneceği klasör
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname); // Dosya adı
    }
});

const upload = multer({ storage: storage }); // Yükleme fonksiyonu

// Ana sayfa rotası
router.get('/', (req, res) => {
    res.render('index');
});

// Kayıt sayfası
router.get('/signup', (req, res) => {
    res.render('signup');
});

// Kullanıcı kayıt işlemi
router.post('/signup', (req, res) => {
    const { first_name, last_name, email, password, phone_number } = req.body;

    // Şifreyi hashleme
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            console.error(err);
            return res.send('Kayıt işlemi sırasında bir hata oluştu.');
        }

        // Kullanıcıyı veritabanına ekle
        db.query('INSERT INTO users (first_name, last_name, email, password, phone_number) VALUES (?, ?, ?, ?, ?)', 
        [first_name, last_name, email, hash, phone_number], (err, result) => {
            if (err) {
                console.error(err);
                return res.send('Kayıt işlemi sırasında bir hata oluştu.');
            }

            res.send('Kayıt başarılı! Artık giriş yapabilirsiniz.');
        });
    });
});

// Giriş sayfası
router.get('/login', (req, res) => {
    res.render('login');
});

// Kullanıcı giriş işlemi
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Kullanıcıyı veritabanında arama
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error(err);
            return res.send('Bir hata oluştu.');
        }

        if (results.length > 0) {
            const user = results[0];

            // Hashlenmiş şifreyi doğrulama
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) {
                    console.error(err);
                    return res.send('Bir hata oluştu.');
                }

                if (isMatch) {
                    req.session.user = user; // Kullanıcıyı oturumda sakla
                    res.redirect('/dashboard');
                } else {
                    res.send('Geçersiz kullanıcı adı veya şifre!');
                }
            });
        } else {
            res.send('Geçersiz kullanıcı adı veya şifre!');
        }
    });
});

// BOM dosyası yükleme ve veritabanına kaydetme
router.post('/upload-bom', upload.single('bomFile'), (req, res) => {
    const userId = req.session.user.id;
    const fileName = req.file.filename;
    const filePath = req.file.path; // Yüklenen dosyanın yolunu al

    // Dosya içeriğini oku
    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(err);
            return res.send('Dosya okunurken bir hata oluştu.');
        }

        // Veritabanına dosya bilgilerini ve içeriğini kaydet
        db.query('INSERT INTO bom_files (user_id, file_name, file_content) VALUES (?, ?, ?)', 
        [userId, fileName, data], (err, result) => {
            if (err) {
                console.error(err);
                return res.send('BOM dosyası veritabanına kaydedilirken bir hata oluştu.');
            }

            res.send('BOM dosyası başarıyla yüklendi ve veritabanına kaydedildi.');
        });
    });
});

// Dashboard sayfası
router.get('/dashboard', (req, res) => {
    if (req.session.user) {
        const userId = req.session.user.id;

        // Kullanıcının BOM dosyalarını al
        db.query('SELECT * FROM bom_files WHERE user_id = ?', [userId], (err, bomFiles) => {
            if (err) {
                console.error(err);
                return res.send('Bir hata oluştu.');
            }

            // Dosya bilgilerini doğrudan bomFilesData olarak gönderiyoruz
            res.render('dashboard', {
                email: req.session.user.email,
                first_name: req.session.user.first_name,
                last_name: req.session.user.last_name,
                bomFilesData: bomFiles // Doğrudan gönder
            });
        });
    } else {
        res.redirect('/login');
    }
});

// Dosya indirme rotası
router.get('/download/:id', (req, res) => {
    const fileId = req.params.id;

    // Veritabanından dosya içeriğini al
    db.query('SELECT file_name, file_content FROM bom_files WHERE id = ?', [fileId], (err, results) => {
        if (err || results.length === 0) {
            console.error(err);
            return res.send('Dosya bulunamadı.');
        }

        const fileName = results[0].file_name;
        const fileContent = results[0].file_content;

        // Dosyayı indirme işlemi
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        res.send(fileContent);
    });
});

// Kullanıcı profili sayfası
router.get('/profile', (req, res) => {
    if (req.session.user) {
        res.render('profile', { user: req.session.user });
    } else {
        res.redirect('/login');
    }
});

// Logout işlemi
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            return res.send('Çıkış yaparken bir hata oluştu.');
        }
        res.redirect('/');
    });
});

module.exports = router;
