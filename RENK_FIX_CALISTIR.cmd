@echo off
chcp 65001 >nul
echo LetsGo2Travel renk/kontrast fix V14D basliyor...
node apply-renk-kontrast-fix-v14d.js
if errorlevel 1 goto fail

echo.
echo Build aliniyor...
npm run build
if errorlevel 1 goto fail

echo.
echo Git commit ve push...
git add -A
git commit -m "Ana sayfa kart yazı kontrastları düzeltildi"
git push origin main

echo.
echo TAMAM: Fix uygulandi ve pushlandi. Vercel deploy dusmezse npx vercel@latest --prod calistir.
pause
exit /b 0

:fail
echo.
echo HATA OLDU. Yukaridaki kirmizi/hatali satiri ChatGPT'ye at.
pause
exit /b 1
