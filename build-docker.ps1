# Simple build script for NPI Builder Docker container
Write-Host "Building NPI Builder Docker image..."

$ErrorActionPreference = 'Stop'

# Build the Docker image.
docker build -t npi-builder .
if ($LASTEXITCODE -ne 0) { throw "Docker image build failed." }

Write-Host "Docker image built successfully!"

New-Item -ItemType Directory -Force -Path (Join-Path $PWD 'release') | Out-Null
docker run --rm --volume "${PWD}\release:/project/release" npi-builder
if ($LASTEXITCODE -ne 0) { throw "NPI Builder packaging failed." }

Write-Host ""
Write-Host "The Windows portable executable is in the release directory."
