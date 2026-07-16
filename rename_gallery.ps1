$i = 1
Get-ChildItem public/gallery/*.jpg | Sort-Object Name | ForEach-Object {
  Rename-Item -Path $_.FullName -NewName ("hyuhyuam-hermitage-" + $i + ".jpg") -ErrorAction SilentlyContinue
  $i = $i + 1
}
Write-Host ("Renamed " + (Get-ChildItem public/gallery/*.jpg).Count + " files")
Get-ChildItem public/gallery/*.jpg | Select-Object -First 3 -ExpandProperty Name
