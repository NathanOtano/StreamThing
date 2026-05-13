!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$INSTDIR\streamthing-desktop.exe" 0 streamthing_legacy_delete_done
    Delete "$INSTDIR\streamthing.exe"
  streamthing_legacy_delete_done:

  ReadRegStr $0 HKCU "Environment" "Path"
  ${StrLoc} $1 "$0" "$INSTDIR" ">"
  StrCmp "$1" "" 0 streamthing_path_done
  StrCmp "$0" "" 0 +3
    WriteRegExpandStr HKCU "Environment" "Path" "$INSTDIR"
    Goto streamthing_path_done
  WriteRegExpandStr HKCU "Environment" "Path" "$0;$INSTDIR"
  streamthing_path_done:
  System::Call 'user32::SendMessageTimeoutW(i 0xffff, i ${WM_SETTINGCHANGE}, i 0, w "Environment", i 0, i 5000, *i .r0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ReadRegStr $0 HKCU "Environment" "Path"
  ${WordReplace} "$0" "$INSTDIR;" "" "+" $0
  ${WordReplace} "$0" ";$INSTDIR" "" "+" $0
  ${WordReplace} "$0" "$INSTDIR" "" "+" $0
  WriteRegExpandStr HKCU "Environment" "Path" "$0"
  System::Call 'user32::SendMessageTimeoutW(i 0xffff, i ${WM_SETTINGCHANGE}, i 0, w "Environment", i 0, i 5000, *i .r0)'
!macroend
