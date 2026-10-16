@echo off
chcp 65001 >nul
title Mis Suenos ERP - Gustavo Rosa Informatica
cd /d "%~dp0"
set PORT=3000
echo ======================================================================
echo   INICIANDO Mis Suenos ERP EM MODO APLICATIVO DESKTOP (Porta 3000)
echo ======================================================================

:: Abre em Modo Aplicativo Nativo (sem barra de navegacao e sem abas)
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    echo [INFO] Abrindo em Modo Aplicativo no Google Chrome...
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="http://localhost:3000"
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    echo [INFO] Abrindo em Modo Aplicativo no Microsoft Edge...
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app="http://localhost:3000"
) else (
    echo [INFO] Abrindo no Navegador Padrao...
    start http://localhost:3000
)

echo [INFO] Servidor rodando. Para encerrar, feche esta janela.
echo ======================================================================
node scripts/servidor_web.js
pause
