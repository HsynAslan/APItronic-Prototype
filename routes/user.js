const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../config/db');
const nodemailer = require('nodemailer');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { loadExcel, findPartNumberColumn } = require('../routes/excelParser'); // Excel işlemleri için ekledik
const { getPartDetails } = require('../apis/digikeyAPI'); // DigiKey API çağrısı
const { callDigiKeyAPI, regenerateToken } = require('../apis/digikeyAuth'); // regenerateToken ve callDigiKeyAPI fonksiyonlarını içe aktarıyoruz
const axios = require('axios');
const { callMouserAPI } = require('../apis/mouserAPI'); // Mouser API'yi ekledik
const { getArrowProductData } = require('../apis/arrowApi');
router.use(express.json()); // JSON verileri alabilmek için gerekli middleware

// Yükleme klasörünü kontrol et ve yoksa oluştur
let accessToken = null; // Token'ı bellekte tutuyoruz
let tokenExpiry = null; // Token'ın süresini takip ediyoruz

async function getToken() {
    const currentTime = Date.now();

    // token var ve süresi dolmamış
    if (accessToken && tokenExpiry && currentTime < tokenExpiry) {
        
        return accessToken;
    } else {
        // Token yok veya süresi dolmuş ---> yeni token üret
        console.log('Yeni token üretiliyor...');
        accessToken = await regenerateToken(); // Token alındı
        tokenExpiry = currentTime + (10 * 60 * 1000); // 10 dk da 1 yenile
        return accessToken;
    }
}

// Token yenileme endpoint'i
router.get('/generate-token', async (req, res) => {
    try {
        const token = await regenerateToken(); // Token yenileme fonksiyonunu çağırıyoruz
        console.log("Yeni Token Üretildi:", token);  // Token'ı backend console'da logla
        res.json({ token });
    } catch (error) {
        console.error('Token yenileme hatası:', error.message);
        res.status(500).json({ error: 'Token yenileme başarısız oldu.' });
    }
});

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
router.get('/api/digikey/partdetails/:partNumber', async (req, res) => {
    const partNumber = req.params.partNumber;
    try {
        const token = await getToken(); // Mevcut token'ı al veya yenile
        const result = await callDigiKeyAPI(partNumber, token); // API'yi çağır ve token'ı kullan
        res.json(result);
    } catch (error) {
        console.error('DigiKey API çağrısı başarısız3:');
        res.status(500).json({ error: 'DigiKey API hatası' });
    }
});



// Dosya yükleme ayarları
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
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
        from: 'apitronic06@gmail.com',
        to: toEmail,
        subject: 'APItronic Hesap Doğrulama',
        text: `Hesabınızı doğrulamak için lütfen şu kodu kullanın: ${verificationCode}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
        } else {
            console.log('E-posta gönderildi: ' + info.response);
        }
    });
}
const { getDigiKeyPartDetails } = require('../apis/digikeyAPI');
// Her part numarası için DigiKey'den detayları almak için route
router.get('/digikey/partdetails/:partNumber', async (req, res) => {
    const partNumber = req.params.partNumber;
    try {
        const partDetails = await callDigiKeyAPI(partNumber);
        res.json(partDetails);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching part details' });
    }
});


// Part numaralarını getirip console'da gösterecek yeni route
// Part numaralarını getirip console'da gösterecek yeni route
// Part numaralarını getirip console'da gösterecek yeni route
router.get('/part-numbers/:fileId', async (req, res) => {
    const fileId = req.params.fileId;
    console.log("Part numaraları istek alındı, Dosya ID'si: " + fileId);

    try {
        const token = await getToken(); // Token'ı al
        console.log("Token alındı:", token);  // Token'ı backend console'da logla

        db.query('SELECT file_content FROM bom_files WHERE id = ?', [fileId], async (err, results) => {
            if (err || results.length === 0) {
                return res.status(404).json({ message: 'Dosya bulunamadı.' });
            }

            const fileBuffer = Buffer.from(results[0].file_content);
            const excelData = loadExcel(fileBuffer); // Excel dosyasını yükleyin
            const partNumberColumnIndex = findPartNumberColumn(excelData);

            if (partNumberColumnIndex !== -1) {
                const partNumbers = excelData.slice(1).map(row => row[partNumberColumnIndex]);
                console.log("Alınan Part Numaraları:", partNumbers);  // Part numaralarını logla

                // Part numaralarını client'a geri gönder
                res.json({ partNumbers });
            } else {
                res.status(404).json({ message: 'Part numarası içeren sütun bulunamadı.' });
            }
        });
    } catch (error) {
        console.error('Hata oluştu:', error.message);
        res.status(500).json({ message: 'Bir hata oluştu.' });
    }
});



router.post('/mouser-search-partnumber', async (req, res) => {
    const partNumber = req.body.partNumber; // İstemciden gelen parça numarası

    try {
        const result = await callMouserAPI(partNumber); // Mouser API'yi çağır
        res.json(result); // Veriyi client'a gönder
    } catch (error) {
        console.error(`Mouser API çağrısı başarısız oldu: ${partNumber}`, error.message);
        res.status(500).json({ error: 'Mouser API hatası' });
    }
});




// Ana sayfa rotası
router.get('/', (req, res) => {
    res.render('index');
});

// Kayıt sayfası
router.get('/signup', (req, res) => {
    res.render('signup', { errorMessage: null });  // Her zaman boş bir errorMessage gönderiyoruz
});


// Kayıt sayfası (POST)
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
                    const verificationCode = crypto.randomBytes(3).toString('hex');

                    db.query('INSERT INTO email_verification (user_id, verification_code, verified, created_at) VALUES (?, ?, 0, NOW())', 
                    [userId, verificationCode], (err) => {
                        if (err) {
                            console.error(err);
                            return res.send('Doğrulama bilgileri veritabanına kaydedilirken bir hata oluştu.');
                        }

                        // E-posta gönder
                        sendVerificationEmail(email, verificationCode);

                        res.render('verify', { email: email, errorMessage: null });
                    });
                });
            });
        }
    });
});



router.post('/verify-email', (req, res) => {
    const { email, verificationCode } = req.body;

    db.query('SELECT u.id, ev.verification_code FROM users u JOIN email_verification ev ON u.id = ev.user_id WHERE u.email = ?', 
    [email], (err, results) => {
        if (err) {
            console.error(err);
            return res.send('Bir hata oluştu. Lütfen tekrar deneyin.');
        }

        if (results.length > 0) {
            const userId = results[0].id;
            const dbVerificationCode = results[0].verification_code;

            // Doğrulama kodunu kontrol et
            if (verificationCode === dbVerificationCode) {
                // Kullanıcıyı doğrulandı olarak işaretle
                db.query('UPDATE email_verification SET verified = 1, verification_code = NULL WHERE user_id = ?', [userId], (err) => {
                    if (err) {
                        console.error(err);
                        return res.send('Doğrulama sırasında bir hata oluştu.');
                    }

                    // Doğrulama başarılı; kullanıcıyı dashboard'a yönlendir
                    res.redirect('/dashboard');
                });
            } else {
                // Yanlış kod; hata mesajı ile doğrulama sayfasına dön
                res.render('verify', { email: email, errorMessage: 'Yanlış doğrulama kodu. Lütfen tekrar deneyin.' });
            }
        } else {
            res.render('verify', { email: email, errorMessage: 'E-posta veya doğrulama kodu hatalı. Lütfen tekrar deneyin.' });
        }
    });
});

router.post('/resend-verification-code', (req, res) => {
    const { email } = req.body;

    db.query('SELECT u.id, ev.verified FROM users u JOIN email_verification ev ON u.id = ev.user_id WHERE u.email = ?', [email], (err, results) => {
        if (err || results.length === 0) {
            return res.render('signup', { errorMessage: 'Bu e-posta adresiyle bir hesap bulunamadı.' });
        }

        const user = results[0];

        if (user.verified === 1) {
            return res.render('signup', { errorMessage: 'Bu e-posta zaten doğrulanmış. Lütfen giriş yapın.' });
        }

        // Yeni doğrulama kodu oluştur ve gönder
        const newVerificationCode = crypto.randomBytes(3).toString('hex');
        db.query('UPDATE email_verification SET verification_code = ?, verified = 0 WHERE user_id = ?', [newVerificationCode, user.id], (err) => {
            if (err) {
                return res.send('Doğrulama kodu güncellenirken bir hata oluştu.');
            }

            sendVerificationEmail(email, newVerificationCode); // Yeni kodu gönder
            res.render('verify', { email, successMessage: 'Yeni doğrulama kodu gönderildi. Lütfen kontrol edin.' });
        });
    });
});

// Giriş sayfası
router.get('/login', (req, res) => {
    res.render('login');
});

// Login işlemi sırasında hata kontrolü
router.post('/login', (req, res) => {
    const { email, password } = req.body;

    db.query('SELECT u.*, ev.verified FROM users u LEFT JOIN email_verification ev ON u.id = ev.user_id WHERE u.email = ?', [email], (err, results) => {
        if (err || results.length === 0) {
            return res.render('login', { errorMessage: 'Geçersiz kullanıcı adı veya şifre!' });
        }

        const user = results[0];

        // Kullanıcının doğrulaması yapılmamışsa
        if (!user.verified) {
            return res.render('login', { errorMessage: 'E-posta adresiniz doğrulanmamış. Lütfen doğrulama işlemini tamamlayın.' });
        }

        // Şifre doğrulaması
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err || !isMatch) {
                return res.render('login', { errorMessage: 'Geçersiz kullanıcı adı veya şifre!' });
            }

            // Başarılı giriş
            req.session.user = user;
            res.redirect('/dashboard');
        });
    });
});

// Dashboard sayfası rotası
router.get('/dashboard', (req, res) => {
    const uploadSuccess = req.query.uploadSuccess === 'true'; 
    if (req.session.user) {
        const userId = req.session.user.id;

        db.query('SELECT * FROM bom_files WHERE user_id = ?', [userId], (err, bomFiles) => {
            if (err) {
                console.error(err);
                return res.send('Bir hata oluştu.');
            }

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
                        bomFilesData: results,
                        uploadSuccess 
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

    // Kullanıcı ID'si kontrolü
    if (!userId) {
        return res.send('Oturum açmış bir kullanıcı bulunamadı.');
    }

    const fileName = req.file.filename;
    const filePath = req.file.path; // Yüklenen dosyanın yolunu al

    // Dosya içeriğini oku
    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(err);
            return res.send('Dosya okunurken bir hata oluştu.');
        }

        // veritabanı kontrolü
        db.query('INSERT INTO bom_files (user_id, file_name, file_content) VALUES (?, ?, ?)', 
        [userId, fileName, data], (err, result) => {
            if (err) {
                console.error(err);
                return res.send('BOM dosyası veritabanına kaydedilirken bir hata oluştu.');
            }
            // başarılı
            res.redirect('/dashboard');
           
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
router.get('/part-details', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Kullanıcı oturum açmamışsa giriş sayfasına yönlendir
    }

    const userId = req.session.user.id; // Oturum açmış kullanıcının ID'si
    const partNumbers = JSON.parse(req.query.partNumbers); // Gelen part numaraları

    try {
        // Favori ürünleri ve takip edilen ürünleri veritabanından çek
        db.query('SELECT part_number FROM favorites WHERE user_id = ?', [userId], (err, favoriler) => {
            if (err) {
                console.error('Favoriler sorgusu başarısız:', err);
                return res.status(500).send('Favoriler alınamadı');
            }

            db.query('SELECT part_number FROM watchlist WHERE user_id = ?', [userId], async (err, takipEdilenler) => {
                if (err) {
                    console.error('Takip edilenler sorgusu başarısız:', err);
                    return res.status(500).send('Takip edilenler alınamadı');
                }

                const token = await getToken(); // Token alınması
                const digikeyResults = await Promise.all(partNumbers.map(async (partNumber) => {
                    try {
                        const result = await callDigiKeyAPI(partNumber, token); // DigiKey API
                        return { partNumber, result };
                    } catch (error) {
                        console.error(`DigiKey API çağrısı başarısız oldu: ${partNumber}`);
                        return { partNumber, result: null };
                    }
                }));

                const mouserResults = await Promise.all(partNumbers.map(async (partNumber) => {
                    try {
                        const result = await callMouserAPI(partNumber); // Mouser API
                        return { partNumber, result };
                    } catch (error) {
                        console.error(`Mouser API çağrısı başarısız oldu: ${partNumber}`);
                        return { partNumber, result: null };
                    }
                }));

                res.render('partdetails', {
                    partNumbers,
                    digikeyResults,
                    mouserResults,
                    arrowResults: [], // Placeholder for Arrow API sonuçları
                    favoriler: favoriler.map(fav => fav.part_number),
                    takipEdilenler: takipEdilenler.map(watch => watch.part_number)
                });
            });
        });
    } catch (error) {
        console.error('Hata oluştu:', error.message);
        res.status(500).send('Bir hata oluştu');
    }
});




// profil bilgisi güncelleme bölümü
router.post('/update-profile', (req, res) => {
    const { first_name, last_name, email, phone_number } = req.body;
    const userId = req.session.user.id;

    // db sorgusu
    db.query('UPDATE users SET first_name = ?, last_name = ?, email = ?, phone_number = ? WHERE id = ?', 
    [first_name, last_name, email, phone_number, userId], (err, result) => {
        if (err) {
            console.error(err);
            return res.send('Profil güncellenirken bir hata oluştu.');
        }

        //güncelleme
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

// Favorilere ekleme
router.post('/add-to-favorites', (req, res) => {
   
    const { partNumber } = req.body;
    const userId = req.session.user.id; // Oturum açmış kullanıcının ID'sini alın
    
    db.query('INSERT INTO favorites (user_id, part_number) VALUES (?, ?)', [userId, partNumber], (err) => {
        if (err) {
            console.error('Favorilere eklerken hata:', err);
            return res.json({ success: false });
        }
        return res.json({ success: true });
    });
});

// Favorilerden çıkarma
router.post('/remove-from-favorites', (req, res) => {
    const { partNumber } = req.body;
    const userId = req.session.user.id;
    
    db.query('DELETE FROM favorites WHERE user_id = ? AND part_number = ?', [userId, partNumber], (err) => {
        if (err) {
            console.error('Favorilerden çıkarırken hata:', err);
            return res.json({ success: false });
        }
        return res.json({ success: true });
    });
});

// Takip listesine ekleme
router.post('/add-to-watchlist', (req, res) => {
    const { partNumber } = req.body;
    const userId = req.session.user.id;

    db.query('INSERT INTO watchlist (user_id, part_number) VALUES (?, ?)', [userId, partNumber], (err) => {
        if (err) {
            console.error('Takip listesine eklerken hata:', err);
            return res.json({ success: false });
        }
        return res.json({ success: true });
    });
});

// Takip listesinden çıkarma
router.post('/remove-from-watchlist', (req, res) => {
    const { partNumber } = req.body;
    const userId = req.session.user.id;

    db.query('DELETE FROM watchlist WHERE user_id = ? AND part_number = ?', [userId, partNumber], (err) => {
        if (err) {
            console.error('Takip listesinden çıkarırken hata:', err);
            return res.json({ success: false });
        }
        return res.json({ success: true });
    });
});

function formatStock(stock) {
    return stock ? `${stock.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} in stock` : 'Stok Bilgisi Yok';
}

function formatLeadTime(weeks) {
    return weeks ? `${weeks * 7} gün` : 'Lead Time Bilgisi Yok'; // Haftayı gün'e çeviriyoruz
}


// Geçersiz URL'ler için 404 middleware
router.use((req, res, next) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

module.exports = router;
