const QR = require('qrcode');

// https 필수: http로 열리면 계정 인증(CORS)이 차단됨 (2026-07 계정 게이트 도입)
const url = 'https://www.howonrise.co.kr';

const variants = [
  { file: 'qr-howonrise.png',       width: 1024, dark: '#0A2540', light: '#FFFFFF' },  // Tanker 네이비 (웹/디자인용)
  { file: 'qr-howonrise-black.png', width: 1024, dark: '#000000', light: '#FFFFFF' },  // 인쇄·복사용 흑백
  { file: 'qr-howonrise-small.png', width: 512,  dark: '#0A2540', light: '#FFFFFF' }   // 웹 공유용 소형
];

(async () => {
  for (const v of variants) {
    const out = `${__dirname}/${v.file}`;
    await QR.toFile(out, url, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: v.width,
      color: { dark: v.dark, light: v.light }
    });
    console.log('OK:', v.file);
  }
})();
