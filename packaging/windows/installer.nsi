Unicode True
RequestExecutionLevel user
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "LogicLib.nsh"

!ifndef APP_VERSION
!define APP_VERSION "0.0.0"
!endif

!ifndef BUNDLE_DIR
!error "BUNDLE_DIR define is required"
!endif

!ifndef OUTPUT_EXE
!define OUTPUT_EXE "ClowderAI-windows-x64-setup.exe"
!endif

!ifndef MAX_REL_PATH_LEN
!define MAX_REL_PATH_LEN "250"
!endif

!ifndef MAX_INSTALL_ROOT_LEN
!define MAX_INSTALL_ROOT_LEN "8"
!endif

!define APP_NAME "Clowder AI"
!define COMPANY_KEY "ClowderLabs"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
!define INSTALL_KEY "Software\${COMPANY_KEY}\${APP_NAME}"
!define STARTMENU_DIR "$SMPROGRAMS\${APP_NAME}"
!define DEFAULT_INSTALL_DIR "C:\CAI"

Name "${APP_NAME}"
OutFile "${OUTPUT_EXE}"
InstallDir "${DEFAULT_INSTALL_DIR}"
InstallDirRegKey HKCU "${INSTALL_KEY}" "InstallDir"
BrandingText "${APP_NAME} Offline Installer"
ShowInstDetails show
ShowUninstDetails show

!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE VerifyInstallDirLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  SetShellVarContext current
  StrLen $0 $INSTDIR
  ${If} $0 > ${MAX_INSTALL_ROOT_LEN}
    StrCpy $INSTDIR "${DEFAULT_INSTALL_DIR}"
  ${EndIf}
FunctionEnd

Function un.onInit
  SetShellVarContext current
FunctionEnd

Function .onVerifyInstDir
  StrLen $0 $INSTDIR
  ${If} $0 > ${MAX_INSTALL_ROOT_LEN}
    Abort
  ${EndIf}
FunctionEnd

Function VerifyInstallDirLeave
  StrLen $0 $INSTDIR
  ${If} $0 > ${MAX_INSTALL_ROOT_LEN}
    MessageBox MB_ICONEXCLAMATION|MB_OK "Install path too long for this build.$\r$\n$\r$\nChoose a path with at most ${MAX_INSTALL_ROOT_LEN} characters, for example ${DEFAULT_INSTALL_DIR}."
    Abort
  ${EndIf}
FunctionEnd

Function CloseRunningServices
  IfFileExists "$INSTDIR\scripts\stop-windows.ps1" +2 0
    ExecWait '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\stop-windows.ps1"'
FunctionEnd

Function un.CloseRunningServices
  IfFileExists "$INSTDIR\scripts\stop-windows.ps1" +2 0
    ExecWait '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\stop-windows.ps1"'
FunctionEnd

Function CleanupManagedPayload
  RMDir /r "$INSTDIR\packages"
  RMDir /r "$INSTDIR\scripts"
  RMDir /r "$INSTDIR\docs"
  RMDir /r "$INSTDIR\cat-cafe-skills"
  RMDir /r "$INSTDIR\tools"
  RMDir /r "$INSTDIR\installer-seed"
  RMDir /r "$INSTDIR\vendor"
  Delete "$INSTDIR\.clowder-release.json"
  Delete "$INSTDIR\.env.example"
  Delete "$INSTDIR\package.json"
  Delete "$INSTDIR\pnpm-lock.yaml"
  Delete "$INSTDIR\pnpm-workspace.yaml"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\SETUP.md"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\AGENTS.md"
  Delete "$INSTDIR\CLA.md"
  Delete "$INSTDIR\CLAUDE.md"
  Delete "$INSTDIR\GEMINI.md"
  Delete "$INSTDIR\SECURITY.md"
  Delete "$INSTDIR\CONTRIBUTING.md"
  Delete "$INSTDIR\MAINTAINERS.md"
  Delete "$INSTDIR\TRADEMARKS.md"
  Delete "$INSTDIR\biome.json"
  Delete "$INSTDIR\tsconfig.base.json"
  Delete "$INSTDIR\.npmrc"
  Delete "$INSTDIR\cat-template.json"
FunctionEnd

Function un.CleanupManagedPayload
  RMDir /r "$INSTDIR\packages"
  RMDir /r "$INSTDIR\scripts"
  RMDir /r "$INSTDIR\docs"
  RMDir /r "$INSTDIR\cat-cafe-skills"
  RMDir /r "$INSTDIR\tools"
  RMDir /r "$INSTDIR\installer-seed"
  RMDir /r "$INSTDIR\vendor"
  Delete "$INSTDIR\.clowder-release.json"
  Delete "$INSTDIR\.env.example"
  Delete "$INSTDIR\package.json"
  Delete "$INSTDIR\pnpm-lock.yaml"
  Delete "$INSTDIR\pnpm-workspace.yaml"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\SETUP.md"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\AGENTS.md"
  Delete "$INSTDIR\CLA.md"
  Delete "$INSTDIR\CLAUDE.md"
  Delete "$INSTDIR\GEMINI.md"
  Delete "$INSTDIR\SECURITY.md"
  Delete "$INSTDIR\CONTRIBUTING.md"
  Delete "$INSTDIR\MAINTAINERS.md"
  Delete "$INSTDIR\TRADEMARKS.md"
  Delete "$INSTDIR\biome.json"
  Delete "$INSTDIR\tsconfig.base.json"
  Delete "$INSTDIR\.npmrc"
  Delete "$INSTDIR\cat-template.json"
FunctionEnd

Function WriteShellShortcuts
  CreateDirectory "${STARTMENU_DIR}"
  CreateShortCut "${STARTMENU_DIR}\Start ${APP_NAME}.lnk" "$INSTDIR\ClowderAI.Desktop.exe" "" "$INSTDIR\ClowderAI.Desktop.exe"
  CreateShortCut "${STARTMENU_DIR}\Stop ${APP_NAME}.lnk" "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\stop-windows.ps1"' "$INSTDIR\scripts\stop-windows.ps1"
  CreateShortCut "${STARTMENU_DIR}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\uninstall.exe"
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\ClowderAI.Desktop.exe" "" "$INSTDIR\ClowderAI.Desktop.exe"
FunctionEnd

Function WriteUninstallRegistry
  WriteRegStr HKCU "${INSTALL_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Clowder Labs"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
FunctionEnd

Section "Install"
  Call CloseRunningServices
  CreateDirectory "$INSTDIR"
  Call CleanupManagedPayload

  SetOutPath "$INSTDIR"
  File /r "${BUNDLE_DIR}\*"

  CreateDirectory "$INSTDIR\data"
  CreateDirectory "$INSTDIR\logs"
  CreateDirectory "$INSTDIR\.cat-cafe"

  IfFileExists "$INSTDIR\.env" +2 0
    CopyFiles /SILENT "$INSTDIR\.env.example" "$INSTDIR\.env"
  IfFileExists "$INSTDIR\cat-config.json" +2 0
    CopyFiles /SILENT "$INSTDIR\installer-seed\cat-config.json" "$INSTDIR\cat-config.json"

  WriteUninstaller "$INSTDIR\uninstall.exe"
  Call WriteShellShortcuts
  Call WriteUninstallRegistry
SectionEnd

Section "Uninstall"
  Call un.CloseRunningServices

  Delete "${STARTMENU_DIR}\Start ${APP_NAME}.lnk"
  Delete "${STARTMENU_DIR}\Stop ${APP_NAME}.lnk"
  Delete "${STARTMENU_DIR}\Uninstall ${APP_NAME}.lnk"
  RMDir "${STARTMENU_DIR}"
  Delete "$DESKTOP\${APP_NAME}.lnk"

  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "${INSTALL_KEY}"

  Call un.CleanupManagedPayload
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  MessageBox MB_ICONINFORMATION|MB_OK "${APP_NAME} binaries were removed.$\r$\n$\r$\nUser data in data, logs, .cat-cafe, .env, and cat-config.json was preserved."
SectionEnd
