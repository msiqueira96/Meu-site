$ErrorActionPreference = 'Stop'
$outDir = Join-Path (Split-Path -Parent $PSScriptRoot) "public\models"
if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
$outFile = Join-Path $outDir "laptop.glb"

# Helper to build an indexed 3D box (24 vertices with positions, normals, UVs, and 36 indices)
$positions = New-Object System.Collections.Generic.List[single]
$normals   = New-Object System.Collections.Generic.List[single]
$uvs       = New-Object System.Collections.Generic.List[single]
$indices   = New-Object System.Collections.Generic.List[uint16]

$meshDefs = New-Object System.Collections.Generic.List[hashtable]

function Add-BoxMesh {
  param(
    [string]$Name,
    [single]$cx, [single]$cy, [single]$cz,
    [single]$sx, [single]$sy, [single]$sz,
    [int]$MatIndex
  )
  $vStart = [int]($positions.Count / 3)
  $iStart = $indices.Count
  $hx = $sx * 0.5; $hy = $sy * 0.5; $hz = $sz * 0.5

  # 6 faces: +Z (front), -Z (back), +Y (top), -Y (bottom), +X (right), -X (left)
  $faces = @(
    @{ n = @(0,0,1);  v = @( @(-$hx,-$hy,$hz), @($hx,-$hy,$hz), @($hx,$hy,$hz), @(-$hx,$hy,$hz) ) },
    @{ n = @(0,0,-1); v = @( @($hx,-$hy,-$hz), @(-$hx,-$hy,-$hz), @(-$hx,$hy,-$hz), @($hx,$hy,-$hz) ) },
    @{ n = @(0,1,0);  v = @( @(-$hx,$hy,$hz), @($hx,$hy,$hz), @($hx,$hy,-$hz), @(-$hx,$hy,-$hz) ) },
    @{ n = @(0,-1,0); v = @( @(-$hx,-$hy,-$hz), @($hx,-$hy,-$hz), @($hx,-$hy,$hz), @(-$hx,-$hy,$hz) ) },
    @{ n = @(1,0,0);  v = @( @($hx,-$hy,$hz), @($hx,-$hy,-$hz), @($hx,$hy,-$hz), @($hx,$hy,$hz) ) },
    @{ n = @(-1,0,0); v = @( @(-$hx,-$hy,-$hz), @(-$hx,-$hy,$hz), @(-$hx,$hy,$hz), @(-$hx,$hy,-$hz) ) }
  )

  $fIdx = 0
  foreach ($f in $faces) {
    $baseV = $vStart + $fIdx * 4
    $nx = [single]$f.n[0]; $ny = [single]$f.n[1]; $nz = [single]$f.n[2]
    $faceUvs = @( @(0.0, 0.0), @(1.0, 0.0), @(1.0, 1.0), @(0.0, 1.0) )
    for ($k = 0; $k -lt 4; $k++) {
      $vx = $cx + [single]$f.v[$k][0]
      $vy = $cy + [single]$f.v[$k][1]
      $vz = $cz + [single]$f.v[$k][2]
      $positions.Add($vx); $positions.Add($vy); $positions.Add($vz)
      $normals.Add($nx);   $normals.Add($ny);   $normals.Add($nz)
      $uvs.Add([single]$faceUvs[$k][0]); $uvs.Add([single]$faceUvs[$k][1])
    }
    $indices.Add([uint16]($baseV + 0)); $indices.Add([uint16]($baseV + 1)); $indices.Add([uint16]($baseV + 2))
    $indices.Add([uint16]($baseV + 0)); $indices.Add([uint16]($baseV + 2)); $indices.Add([uint16]($baseV + 3))
    $fIdx++
  }

  $meshDefs.Add(@{
    name = $Name
    vStart = $vStart
    vCount = 24
    iStart = $iStart
    iCount = 36
    min = @( ($cx - $hx), ($cy - $hy), ($cz - $hz) )
    max = @( ($cx + $hx), ($cy + $hy), ($cz + $hz) )
    mat = $MatIndex
  })
}

# Build Laptop Meshes:
# 0: Base_Chassis (Aluminum Space Black)
Add-BoxMesh -Name "Base_Chassis" -cx 0.0 -cy 0.0 -cz 0.0 -sx 3.10 -sy 0.11 -sz 2.12 -MatIndex 0
# 1: Keyboard_Well (Recessed Matte Black + Backlit Grid)
Add-BoxMesh -Name "Keyboard_Well" -cx 0.0 -cy 0.052 -cz -0.18 -sx 2.58 -sy 0.025 -sz 1.05 -MatIndex 1
# 2: Trackpad_Glass (Force Touch Glass Trackpad)
Add-BoxMesh -Name "Trackpad_Glass" -cx 0.0 -cy 0.056 -cz 0.64 -sx 0.96 -sy 0.015 -sz 0.56 -MatIndex 2
# 3: Hinge_Clutch (Rear Cylindrical Hinge Barrel)
Add-BoxMesh -Name "Hinge_Clutch" -cx 0.0 -cy 0.045 -cz -1.02 -sx 2.10 -sy 0.08 -sz 0.10 -MatIndex 1

# Lid Meshes (Local coordinates relative to the Hinge Pivot at [0, 0.06, -1.04]):
# 4: Lid_Shell (Outer Anodized Aluminum Lid)
Add-BoxMesh -Name "Lid_Shell" -cx 0.0 -cy 1.02 -cz -0.03 -sx 3.10 -sy 2.02 -sz 0.055 -MatIndex 0
# 5: Lid_Bezel (Piano Black Glass Display Bezel)
Add-BoxMesh -Name "Lid_Bezel" -cx 0.0 -cy 1.02 -cz 0.002 -sx 3.04 -sy 1.96 -sz 0.012 -MatIndex 1
# 6: Screen (16:10 Active Display Panel with clean 0..1 UVs on +Z face)
Add-BoxMesh -Name "Screen" -cx 0.0 -cy 1.04 -cz 0.012 -sx 2.90 -sy 1.8125 -sz 0.006 -MatIndex 3

# Pack binary buffers:
# Chunk 1: All Positions (float32 x 3)
# Chunk 2: All Normals (float32 x 3)
# Chunk 3: All UVs (float32 x 2)
# Chunk 4: All Indices (uint16)
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)

$posByteOffset = 0
foreach ($f in $positions) { $bw.Write([single]$f) }
$posByteLength = [int]$ms.Position

$normByteOffset = [int]$ms.Position
foreach ($f in $normals) { $bw.Write([single]$f) }
$normByteLength = [int]$ms.Position - $normByteOffset

$uvByteOffset = [int]$ms.Position
foreach ($f in $uvs) { $bw.Write([single]$f) }
$uvByteLength = [int]$ms.Position - $uvByteOffset

$idxByteOffset = [int]$ms.Position
foreach ($i in $indices) { $bw.Write([uint16]$i) }
$idxByteLength = [int]$ms.Position - $idxByteOffset

while (($ms.Position % 4) -ne 0) { $bw.Write([byte]0) }
$binBytes = $ms.ToArray()
$bw.Close()
$ms.Close()

# Build glTF 2.0 JSON structure
$accessors = New-Object System.Collections.Generic.List[hashtable]
$meshes    = New-Object System.Collections.Generic.List[hashtable]

for ($m = 0; $m -lt $meshDefs.Count; $m++) {
  $md = $meshDefs[$m]
  $accPos = $accessors.Count
  $accessors.Add(@{
    bufferView = 0
    byteOffset = $md.vStart * 12
    componentType = 5126
    count = $md.vCount
    type = "VEC3"
    min = $md.min
    max = $md.max
  })
  $accNorm = $accessors.Count
  $accessors.Add(@{
    bufferView = 1
    byteOffset = $md.vStart * 12
    componentType = 5126
    count = $md.vCount
    type = "VEC3"
  })
  $accUv = $accessors.Count
  $accessors.Add(@{
    bufferView = 2
    byteOffset = $md.vStart * 8
    componentType = 5126
    count = $md.vCount
    type = "VEC2"
  })
  $accIdx = $accessors.Count
  $accessors.Add(@{
    bufferView = 3
    byteOffset = $md.iStart * 2
    componentType = 5123
    count = $md.iCount
    type = "SCALAR"
  })

  $meshes.Add(@{
    name = $md.name
    primitives = @(
      @{
        attributes = @{
          POSITION = $accPos
          NORMAL   = $accNorm
          TEXCOORD_0 = $accUv
        }
        indices = $accIdx
        material = $md.mat
      }
    )
  })
}

$gltfObj = @{
  asset = @{
    version = "2.0"
    generator = "MS_OS Procedural GLB Builder v1.0"
  }
  scene = 0
  scenes = @(
    @{
      name = "MS_OS_Laptop_Scene"
      nodes = @(0)
    }
  )
  nodes = @(
    @{
      name = "Laptop_Root"
      children = @(1, 2, 3, 4, 5)
    },
    @{ name = "Base_Chassis";   mesh = 0 },
    @{ name = "Keyboard_Well";  mesh = 1 },
    @{ name = "Trackpad_Glass"; mesh = 2 },
    @{ name = "Hinge_Clutch";   mesh = 3 },
    @{
      name = "Lid"
      translation = @(0.0, 0.06, -1.04)
      children = @(6, 7, 8)
    },
    @{ name = "Lid_Shell"; mesh = 4 },
    @{ name = "Lid_Bezel"; mesh = 5 },
    @{ name = "Screen";    mesh = 6 }
  )
  materials = @(
    @{
      name = "SpaceBlack_Aluminum"
      pbrMetallicRoughness = @{
        baseColorFactor = @(0.16, 0.18, 0.23, 1.0)
        metallicFactor = 0.88
        roughnessFactor = 0.22
      }
    },
    @{
      name = "MatteBlack_KeyWell"
      pbrMetallicRoughness = @{
        baseColorFactor = @(0.04, 0.05, 0.07, 1.0)
        metallicFactor = 0.35
        roughnessFactor = 0.65
      }
    },
    @{
      name = "ForceTouch_Glass"
      pbrMetallicRoughness = @{
        baseColorFactor = @(0.12, 0.14, 0.18, 1.0)
        metallicFactor = 0.45
        roughnessFactor = 0.15
      }
    },
    @{
      name = "Retina_Display_Screen"
      pbrMetallicRoughness = @{
        baseColorFactor = @(1.0, 1.0, 1.0, 1.0)
        metallicFactor = 0.05
        roughnessFactor = 0.12
      }
    }
  )
  meshes = $meshes
  accessors = $accessors
  bufferViews = @(
    @{ buffer = 0; byteOffset = $posByteOffset;  byteLength = $posByteLength;  target = 34962 },
    @{ buffer = 0; byteOffset = $normByteOffset; byteLength = $normByteLength; target = 34962 },
    @{ buffer = 0; byteOffset = $uvByteOffset;   byteLength = $uvByteLength;   target = 34962 },
    @{ buffer = 0; byteOffset = $idxByteOffset;  byteLength = $idxByteLength;  target = 34963 }
  )
  buffers = @(
    @{ byteLength = $binBytes.Length }
  )
}

$jsonStr = $gltfObj | ConvertTo-Json -Depth 12 -Compress
$jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonStr)
$jsonPad = (4 - ($jsonBytes.Length % 4)) % 4
if ($jsonPad -gt 0) {
  $paddedJson = New-Object byte[] ($jsonBytes.Length + $jsonPad)
  [System.Array]::Copy($jsonBytes, $paddedJson, $jsonBytes.Length)
  for ($p = 0; $p -lt $jsonPad; $p++) { $paddedJson[$jsonBytes.Length + $p] = 0x20 }
  $jsonBytes = $paddedJson
}

$totalLen = 12 + 8 + $jsonBytes.Length + 8 + $binBytes.Length
$fs = New-Object System.IO.FileStream($outFile, [System.IO.FileMode]::Create)
$fbw = New-Object System.IO.BinaryWriter($fs)

# GLB Header
$fbw.Write([uint32]0x46546C67) # 'glTF'
$fbw.Write([uint32]2)          # version 2
$fbw.Write([uint32]$totalLen)

# Chunk 0: JSON
$fbw.Write([uint32]$jsonBytes.Length)
$fbw.Write([uint32]0x4E4F534A) # 'JSON'
$fbw.Write($jsonBytes)

# Chunk 1: BIN
$fbw.Write([uint32]$binBytes.Length)
$fbw.Write([uint32]0x004E4942) # 'BIN\0'
$fbw.Write($binBytes)

$fbw.Close()
$fs.Close()
Write-Output "Generated GLB at $outFile ($totalLen bytes)"
