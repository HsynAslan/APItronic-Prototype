const axios = require('axios');
let accessToken = null;

// Token Alma Fonksiyonu
async function getArrowToken() {
    // API anahtarı geldiğinde bu alanları doldur
    const apiKey = 'YOUR_API_KEY';
    const apiUrl = 'https://api.arrow.com/token'; // Doğru URL'yi Arrow dokümantasyonuna göre değiştir

    try {
        const response = await axios.post(apiUrl, {
            headers: {
                'API-Key': apiKey
            }
        });
        accessToken = response.data.access_token;
        console.log('Arrow Access Token:', accessToken);
        return accessToken;
    } catch (error) {
        console.error('Arrow Token Alma Hatası:', error);
    }
}

// Ürün Verisi Çekme Fonksiyonu
async function getArrowProductData(partNumber) {
    if (!accessToken) {
        await getArrowToken();
    }

    const productUrl = `https://api.arrow.com/product?partNumber=${partNumber}`; // Uygun API URL'si

    try {
        const response = await axios.get(productUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        console.log('Arrow Ürün Verisi:', response.data);
        return response.data;
    } catch (error) {
        console.error('Arrow Ürün Verisi Alma Hatası:', error);
    }
}

module.exports = { getArrowToken, getArrowProductData };
