; V1 (identifier com.amiri.amverge) and V2 (app.amverge) share the product name
; and install directory, so NSIS finds V1's uninstall entry and hands off to it.
; That hand-off fails on some machines with "Error launching installer", leaving
; the upgrade dead until the user removes V1 from Control Panel by hand.
;
; Run it ourselves instead: silently, and only for a 1.x install, so a normal
; V2 -> V2 upgrade is untouched. Any failure is ignored - a leftover V1 entry is
; a far smaller problem than an installer that refuses to run.
!macro NSIS_HOOK_PREINSTALL
  Var /GLOBAL AmvOldUninst
  Var /GLOBAL AmvOldVer

  ReadRegStr $AmvOldVer HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AMVerge" "DisplayVersion"
  ReadRegStr $AmvOldUninst HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AMVerge" "UninstallString"
  StrCmp $AmvOldVer "" 0 amv_check
    ReadRegStr $AmvOldVer HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AMVerge" "DisplayVersion"
    ReadRegStr $AmvOldUninst HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AMVerge" "UninstallString"

  amv_check:
    StrCmp $AmvOldUninst "" amv_done
    StrCpy $R9 $AmvOldVer 2
    StrCmp $R9 "1." 0 amv_done

    ; strip the quotes NSIS stores around the path
    StrCpy $R8 $AmvOldUninst 1
    StrCmp $R8 '"' 0 +3
      StrLen $R7 $AmvOldUninst
      IntOp $R7 $R7 - 2
      StrCpy $AmvOldUninst $AmvOldUninst $R7 1

    IfFileExists "$AmvOldUninst" 0 amv_done
      ExecWait '"$AmvOldUninst" /S'
      Sleep 1500

  amv_done:
!macroend
