@echo off
title Native Factory Studio
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-studio.ps1"
if errorlevel 1 pause
