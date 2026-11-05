!macro customInstall
  SetOutPath "$INSTDIR"
  CreateShortCut "$DESKTOP\Foxglove－104 视觉案例.lnk" "$INSTDIR\Foxglove-104-Vision.exe" "--demo-control --vision-demo" "$INSTDIR\foxglove-104.ico"
  CreateShortCut "$SMPROGRAMS\Foxglove－104 视觉案例.lnk" "$INSTDIR\Foxglove-104-Vision.exe" "--demo-control --vision-demo" "$INSTDIR\foxglove-104.ico"
!macroend
!macro customUnInstall
  Delete "$DESKTOP\Foxglove－104 视觉案例.lnk"
  Delete "$SMPROGRAMS\Foxglove－104 视觉案例.lnk"
!macroend
