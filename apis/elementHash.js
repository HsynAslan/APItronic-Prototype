const crypto = require('crypto');

// Gizli anahtar (API'den aldığınız secret key)
const secretKey = 'kvznkcr48a8a4kxebwpgdjqb';

// Zaman damgası (UTC formatında)
const timestamp = new Date().toISOString();

// İmzalanacak veri (istek türü + timestamp)
const data = 'searchByPremierFarnellPartNumber' + timestamp;

// HMAC SHA1 ile imza oluşturma
const hmac = crypto.createHmac('sha1', secretKey);
hmac.update(data);
const signature = hmac.digest('hex');

// Base64 kodlama
const signatureBase64 = Buffer.from(signature, 'hex').toString('base64');

// URL encode işlemi
const signatureUrlEncoded = encodeURIComponent(signatureBase64);

// Console'da göster
console.log('İmza:', signatureUrlEncoded);
console.log('Timestamp:', timestamp);



