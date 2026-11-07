#!/bin/bash
set -euo pipefail

# Simple build script for NPI Builder Docker container
echo "Building NPI Builder Docker image..."

# Build the Docker image
docker build -t npi-builder .

echo "Docker image built successfully!"

mkdir -p release
docker run --rm --volume "$PWD/release:/project/release" npi-builder

echo ""
echo "The Windows portable executable is in the release directory."
