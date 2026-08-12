@echo off
setlocal
rem TamCar client — genere l'APK debug en une commande (cmd.exe)
rem Sortie : mobile-client\tamcar-client.apk
cd /d "%~dp0"
call npx cap sync android
if errorlevel 1 exit /b 1
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
cd android
call gradlew.bat assembleDebug
if errorlevel 1 exit /b 1
cd /d "%~dp0"
rem Gradle nomme toujours sa sortie app-debug.apk : on la recopie sous le
rem nom attendu, a la racine du projet, pour ne pas avoir a fouiller
rem l'arborescence de build a chaque installation.
copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "tamcar-client.apk" >nul
if errorlevel 1 exit /b 1
echo.
echo ======================================================
echo APK genere :
echo %~dp0tamcar-client.apk
echo ======================================================
