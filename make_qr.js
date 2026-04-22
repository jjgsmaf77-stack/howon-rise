const QR = require('qrcode');

// NOTE: GitHub Pages 커스텀 도메인의 SSL 인증서가 아직 발급되지 않아
// HTTPS 접속 시 인증서 오류 발생. HTTP로 생성해 모바일 카메라 스캔 시 즉시 접속되도록 함.
// (GitHub repo Settings → Pages → "Enforce HTTPS" 체크박스 활성화로 SSL 발급 후
//  https로 변경 가능)
const url = 'http://www.howonrise.co.kr';

const variants = [
  { file: 'qr-howonrise.png',       width: 1024, dark: '#065F46', light: '#FFFFFF' },  // 브랜드 에메랄드 (웹/디자인용)
  { file: 'qr-howonrise-black.png', width: 1024, dark: '#000000', light: '#FFFFFF' },  // 인쇄·복사용 흑백
  { file: 'qr-howonrise-small.png', width: 512,  dark: '#065F46', light: '#FFFFFF' }   // 웹 공유용 소형
];

(async () => {
  for (const v of variants) {
    const out = `E:/2025 RISE 결과보고서/성과관리플랫폼/${v.file}`;
    await QR.toFile(out, url, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: v.width,
      color: { dark: v.dark, light: v.light }
    });
    console.log('OK:', v.file);
  }
})();
