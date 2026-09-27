@echo off
cd /d "%~dp0"
if not exist "StudyTutor.exe" (
  echo Extract the zip first, then open Start.bat from the extracted folder.
  pause
  exit /b 1
)
StudyTutor.exe
pause
