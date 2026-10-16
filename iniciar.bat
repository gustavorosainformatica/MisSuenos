@echo off
chcp 65001 >nul
title Mis Suenos ERP - Gustavo Rosa Informatica
cd /d "%~dp0"
set PORT=3000
echo ======================================================================
echo   INICIANDO Mis Suenos ERP (Porta 3000)
echo ======================================================================
echo [INFO] Abrindo navegador: http://localhost:3000
start http://localhost:3000
echo [INFO] Servidor rodando. Para encerrar, feche esta janela.
echo ======================================================================
node scripts/servidor_web.js
pause
