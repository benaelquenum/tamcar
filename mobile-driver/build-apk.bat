@echo off
setlocal
rem TamCar Pro (chauffeur) — genere l'APK debug en une commande (cmd.exe)
cd /d "%~dp0"
call npx cap sync android
if errorlevel 1 exit /b 1
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
cd android
call gradlew.bat assembleDebug
if errorlevel 1 exit /b 1
echo.
echo ======================================================
echo APK genere :
echo %~dp0android\app\build\outputs\apk\debug\app-debug.apk
echo ======================================================
