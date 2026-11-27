param(
  [int]$Port = 8080
)

$Root = (Resolve-Path "$PSScriptRoot\..").Path
$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add("http://localhost:$Port/")
$Listener.Start()
Write-Output "Servidor local rodando em http://localhost:$Port/"
Write-Output " - Versao 1 (Completa): http://localhost:$Port/versao-completa/"
Write-Output " - Versao 2 (Direta WhatsApp): http://localhost:$Port/versao-direta/"

$MimeTypes = @{
  ".html"  = "text/html; charset=utf-8"
  ".css"   = "text/css; charset=utf-8"
  ".js"    = "application/javascript; charset=utf-8"
  ".json"  = "application/json; charset=utf-8"
  ".png"   = "image/png"
  ".jpg"   = "image/jpeg"
  ".jpeg"  = "image/jpeg"
  ".webp"  = "image/webp"
  ".avif"  = "image/avif"
  ".svg"   = "image/svg+xml"
  ".ico"   = "image/x-icon"
  ".woff2" = "font/woff2"
  ".woff"  = "font/woff"
  ".ttf"   = "font/ttf"
}

try {
  while ($Listener.IsListening) {
    try {
      $Context = $Listener.GetContext()
      $Req = $Context.Request
      $Res = $Context.Response

      $UrlPath = [Uri]::UnescapeDataString($Req.Url.AbsolutePath)
      if ($UrlPath.EndsWith("/")) {
        $UrlPath = $UrlPath + "index.html"
      }
      $RelPath = $UrlPath.TrimStart("/").Replace("/", "\")
      $FilePath = Join-Path $Root $RelPath

      if ((Test-Path $FilePath -PathType Container)) {
        $FilePath = Join-Path $FilePath "index.html"
      }

      if (Test-Path $FilePath -PathType Leaf) {
        $Ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
        $ContentType = $MimeTypes[$Ext]
        if (-not $ContentType) { $ContentType = "application/octet-stream" }
        $Res.ContentType = $ContentType
        $Res.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
        $Bytes = [System.IO.File]::ReadAllBytes($FilePath)
        $Res.ContentLength64 = $Bytes.Length
        $Res.StatusCode = 200
        $Res.OutputStream.Write($Bytes, 0, $Bytes.Length)
      } else {
        $Res.StatusCode = 404
        $Msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $UrlPath")
        $Res.ContentLength64 = $Msg.Length
        $Res.OutputStream.Write($Msg, 0, $Msg.Length)
      }
      $Res.OutputStream.Close()
    } catch {
      # Ignore client connection reset / aborted requests and keep server alive
    }
  }
} finally {
  $Listener.Stop()
}
