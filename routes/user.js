const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto'); // Rastgele doğrulama kodu oluşturmak için
const db = require('../config/db'); // MySQL bağlantı dosyasını içeri aktarıyoruz
const nodemailer = require('nodemailer'); // E-posta gönderimi için Nodemailer
const router = express.Router();
const multer = require('multer'); // Dosya yükleme için multer
const fs = require('fs'); // Dosya işlemleri için fs
const path = require('path'); // Dosya yolu işlemleri için path

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

const upload = multer({ storage: storage }); // Yükleme fonksiyonunu burada tanımlıyoruz

// Nodemailer ayarları
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'apitronic06@gmail.com', // Sabit e-posta adresi (gönderici)
        pass: 'ivax fqrd gdiu jioz'  // 16 haneli uygulama şifresi
    }
});

// Deneme hakları ve engelleme kontrolü için ek tablo: failed_attempts
const FAILED_ATTEMPTS_LIMIT = 3;
const BLOCK_DURATION = 10 * 60 * 1000; // 10 dakika

// Yeni bir kullanıcı kaydettikten sonra e-posta göndermek için fonksiyon
function sendVerificationEmail(toEmail, verificationCode) {
    const mailOptions = {
        from: 'apitronic06@gmail.com', // Sabit gönderici e-posta adresi
        to: toEmail,                    // Alıcının e-posta adresi (kullanıcının girdiği e-posta)
        subject: 'APItronic Hesap Doğrulama',
        text: `Hesabınızı doğrulamak için lütfen şu kodu kullanın: ${verificationCode}`
    };

    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('E-posta gönderildi: ' + info.response);
        }
    });
}

// Ana sayfa rotası
router.get('/', (req, res) => {
    res.render('index');
});

// Kayıt sayfası
router.get('/signup', (req, res) => {
    res.render('signup');
});

router.post('/signup', (req, res) => {
    const { first_name, last_name, email, password, confirm_password, phone_number } = req.body;

    if (password !== confirm_password) {
        return res.render('signup', { errorMessage: 'Şifreler eşleşmiyor. Lütfen tekrar deneyin.' });
    }

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error(err);
            return res.send('Bir hata oluştu. Lütfen tekrar deneyin.');
        }

        if (results.length > 0) {
            return res.render('signup', { errorMessage: 'Bu e-posta adresi ile zaten bir hesap var.' });
        } else {
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) {
                    console.error(err);
                    return res.send('Kayıt işlemi sırasında bir hata oluştu.');
                }

                db.query('INSERT INTO users (first_name, last_name, email, password, phone_number) VALUES (?, ?, ?, ?, ?)', 
                [first_name, last_name, email, hash, phone_number], (err, result) => {
                    if (err) {
                        console.error(err);
                        return res.send('Kayıt işlemi sırasında bir hata oluştu.');
                    }

                    const userId = result.insertId;

                    // E-posta doğrulama yerine doğrudan dashboard'a yönlendiriyoruz
                    db.query('SELECT * FROM users WHERE id = ?', [userId], (err, userResult) => {
                        if (err) {
                            console.error(err);
                            return res.send('Bir hata oluştu. Lütfen tekrar deneyin.');
                        }

                        const user = userResult[0];
                        req.session.user = user;
                        res.redirect('/dashboard');
                    });
                });
            });
        }
    });
});

// Giriş sayfası
router.get('/login', (req, res) => {
    res.render('login');
});

// Login işlemi sırasında hata kontrolü
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error(err);
            return res.send('Bir hata oluştu. Lütfen tekrar deneyin.');
        }

        if (results.length > 0) {
            const user = results[0];

            // Şifreyi doğrulama
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err || !isMatch) {
                    return res.render('login', { errorMessage: 'Geçersiz kullanıcı adı veya şifre!' });
                }

                // Şifre doğruysa kullanıcıyı oturumda sakla ve dashboard'a yönlendir
                req.session.user = user;
                res.redirect('/dashboard');
            });
        } else {
            res.render('login', { errorMessage: 'Geçersiz kullanıcı adı veya şifre!' });
        }
    });
});

// Dashboard sayfası rotası
router.get('/dashboard', (req, res) => {
    const uploadSuccess = req.query.uploadSuccess === 'true'; // Query parametreyi kontrol et
    if (req.session.user) {
        const userId = req.session.user.id;

        db.query('SELECT * FROM bom_files WHERE user_id = ?', [userId], (err, bomFiles) => {
            if (err) {
                console.error(err);
                return res.send('Bir hata oluştu.');
            }

            // BOM dosyalarının içeriğini al
            const fileDataPromises = bomFiles.map((file) => {
                return new Promise((resolve, reject) => {
                    db.query('SELECT * FROM bom_data WHERE bom_file_id = ?', [file.id], (err, data) => {
                        if (err) reject(err);
                        else resolve({ file, data });
                    });
                });
            });

            Promise.all(fileDataPromises)
                .then((results) => {
                    res.render('dashboard', {
                        email: req.session.user.email,
                        first_name: req.session.user.first_name,
                        last_name: req.session.user.last_name,
                        bomFilesData: results, // Yüklenen BOM dosyalarını ve içeriklerini gönder
                        uploadSuccess // uploadSuccess değişkenini gönder
                    });
                })
                .catch((err) => {
                    console.error(err);
                    res.send('BOM dosyaları alınırken bir hata oluştu.');
                });
        });
    } else {
        res.redirect('/login');
    }
});

// Dosya indirme rotası
router.get('/download/:id', (req, res) => {
    const fileId = req.params.id;

    db.query('SELECT file_name, file_content FROM bom_files WHERE id = ?', [fileId], (err, results) => {
        if (err || results.length === 0) {
            console.error(err);
            return res.send('Dosya bulunamadı.');
        }

        const fileName = results[0].file_name;
        const fileContent = results[0].file_content;

        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        res.send(fileContent);
    });
});

// Dosya yükleme rotası
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

            // Başarılı olduğunda dashboard sayfasına uploadSuccess ile yönlendirin
            res.redirect('/dashboard?uploadSuccess=true');
        });
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

// Profil bilgilerini güncelleme
router.post('/update-profile', (req, res) => {
    const { first_name, last_name, email, phone_number } = req.body;
    const userId = req.session.user.id;

    // Kullanıcı bilgilerini güncelleme sorgusu
    db.query('UPDATE users SET first_name = ?, last_name = ?, email = ?, phone_number = ? WHERE id = ?', 
    [first_name, last_name, email, phone_number, userId], (err, result) => {
        if (err) {
            console.error(err);
            return res.send('Profil güncellenirken bir hata oluştu.');
        }

        // Kullanıcı oturumunu güncelle
        req.session.user.first_name = first_name;
        req.session.user.last_name = last_name;
        req.session.user.email = email;
        req.session.user.phone_number = phone_number;

        res.send('Profil başarıyla güncellendi.');
    });
});

// Şifreyi güncelleme
router.post('/update-password', (req, res) => {
    const { current_password, new_password } = req.body;
    const userId = req.session.user.id;

    // Mevcut şifreyi doğrula
    db.query('SELECT password FROM users WHERE id = ?', [userId], (err, results) => {
        if (err || results.length === 0) {
            console.error(err);
            return res.send('Bir hata oluştu.');
        }

        const hashedPassword = results[0].password;

        bcrypt.compare(current_password, hashedPassword, (err, isMatch) => {
            if (err || !isMatch) {
                return res.send('Mevcut şifre yanlış.');
            }

            // Yeni şifreyi hashle ve güncelle
            bcrypt.hash(new_password, 10, (err, hash) => {
                if (err) {
                    console.error(err);
                    return res.send('Şifre güncellenirken bir hata oluştu.');
                }

                db.query('UPDATE users SET password = ? WHERE id = ?', [hash, userId], (err, result) => {
                    if (err) {
                        console.error(err);
                        return res.send('Şifre güncellenirken bir hata oluştu.');
                    }

                    res.send('Şifre başarıyla güncellendi.');
                });
            });
        });
    });
});

// Dosya silme rotası
router.delete('/delete-file/:id', (req, res) => {
    const fileId = req.params.id;
    
    // Dosyayı veritabanından sil
    db.query('DELETE FROM bom_files WHERE id = ?', [fileId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Dosya silinirken bir hata oluştu.');
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).send('Dosya bulunamadı.');
        }
        
        // Dosya başarıyla silindi
        res.status(200).send('Dosya başarıyla silindi.');
    });
});


module.exports = router;
