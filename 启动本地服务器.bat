@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 五子棋本地服务器

where node >nul 2>nul
if errorlevel 1 (
  echo 没有检测到 Node.js，改为直接打开单文件版...
  start "" "五子棋.html"
  exit /b
)

echo 启动中，请稍候...
node serve.js %1
pause
