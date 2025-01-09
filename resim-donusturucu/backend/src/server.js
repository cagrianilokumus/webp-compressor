const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS ayarları
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Dosya yükleme için multer konfigürasyonu
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Express dosya boyutu limitini artır
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Hata yakalama middleware'i
const asyncHandler = (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

// WebP'ye dönüştürme endpoint'i
app.post('/convert-to-webp', upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Dosya yüklenmedi' });
  }

  const quality = parseInt(req.body.quality) || 80;
  const outputPath = path.join('uploads', `${path.parse(req.file.filename).name}.webp`);

  await sharp(req.file.path)
    .webp({ quality })
    .toFile(outputPath);

  // Orijinal dosyayı sil
  await fs.unlink(req.file.path);

  // Dosyayı base64'e çevir
  const webpBuffer = await fs.readFile(outputPath);
  const base64Image = webpBuffer.toString('base64');

  // Base64 verisini gönder
  res.json({ webpImage: base64Image });

  // İşlem tamamlandıktan sonra dönüştürülen dosyayı sil
  await fs.unlink(outputPath).catch(console.error);
}));

// Resim optimizasyonu endpoint'i
app.post('/optimize-image', upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Dosya yüklenmedi' });
  }

  const quality = parseInt(req.body.quality) || 80;
  const outputPath = path.join('uploads', `optimized-${req.file.filename}`);

  await sharp(req.file.path)
    .jpeg({ quality, mozjpeg: true })
    .toFile(outputPath);

  // Orijinal dosyayı sil
  await fs.unlink(req.file.path);

  // Dosyayı base64'e çevir
  const optimizedBuffer = await fs.readFile(outputPath);
  const base64Image = optimizedBuffer.toString('base64');

  // Base64 verisini gönder
  res.json({ optimizedImage: base64Image });

  // İşlem tamamlandıktan sonra optimize edilmiş dosyayı sil
  await fs.unlink(outputPath).catch(console.error);
}));

// Optimize et ve WebP'ye dönüştür endpoint'i
app.post('/optimize-and-convert', upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Dosya yüklenmedi' });
  }

  const quality = parseInt(req.body.quality) || 80;
  const optimizedPath = path.join('uploads', `optimized-${req.file.filename}`);
  const webpPath = path.join('uploads', `${path.parse(req.file.filename).name}.webp`);

  try {
    // Önce optimize et
    await sharp(req.file.path)
      .jpeg({ quality, mozjpeg: true })
      .toFile(optimizedPath);

    // Sonra optimize edilmiş dosyayı WebP'ye dönüştür
    await sharp(optimizedPath)
      .webp({ quality, effort: 6 }) // effort parametresi eklendi (0-6 arası, 6 en iyi sıkıştırma)
      .toFile(webpPath);

    // WebP dosyasını base64'e çevir
    const webpBuffer = await fs.readFile(webpPath);
    const base64Image = webpBuffer.toString('base64');

    // Base64 verisini gönder
    res.json({ optimizedWebpImage: base64Image });

    // Tüm dosyaları temizle
    await Promise.all([
      fs.unlink(req.file.path).catch(console.error),
      fs.unlink(optimizedPath).catch(console.error),
      fs.unlink(webpPath).catch(console.error)
    ]);
  } catch (error) {
    // Hata durumunda dosyaları temizle
    await Promise.all([
      fs.unlink(req.file.path).catch(() => {}),
      fs.unlink(optimizedPath).catch(() => {}),
      fs.unlink(webpPath).catch(() => {})
    ]);
    throw error;
  }
}));

// Genel hata yakalayıcı
app.use((error, req, res, next) => {
  console.error('Sunucu hatası:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'Dosya boyutu çok büyük. Maksimum 50MB yükleyebilirsiniz.'
      });
    }
  }
  
  res.status(500).json({ 
    error: 'İşlem başarısız oldu: ' + (error.message || 'Bilinmeyen hata')
  });
});

// uploads klasörünü oluştur
(async () => {
  try {
    await fs.access('uploads');
  } catch {
    await fs.mkdir('uploads');
  }
})();

app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
}); 