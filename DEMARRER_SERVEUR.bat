@echo off
chcp 65001 >nul
title Serveur Auth Panel
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERREUR] Node.js n'est pas installe.
    echo.
    echo Telecharge-le ici : https://nodejs.org
    echo Installe-le, ferme cette fenetre, puis relance ce script.
    echo.
    start https://nodejs.org
    pause
    exit /b 1
)

echo Installation des dependances...
call npm install
if errorlevel 1 (
    echo Echec de npm install.
    pause
    exit /b 1
)

echo.
echo Demarrage du serveur...
echo Ouvre ton navigateur sur : http://localhost:3000
echo.
echo Pour arreter : ferme cette fenetre.
echo.
call npm start
pause
