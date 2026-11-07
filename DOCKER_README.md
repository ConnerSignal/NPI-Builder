# NPI Builder Docker Build

This directory contains Docker configuration for building the NPI Builder Windows portable executable with the official Wine-enabled electron-builder image.

## Building the Docker Image

To build the Docker image:

```bash
docker build -t npi-builder .
```

## Building the Windows Portable Version

The Docker container will build the Windows portable version of the application:

```bash
mkdir -p release
docker run --rm --volume "$PWD/release:/project/release" npi-builder
```

On PowerShell, use `./build-docker.ps1` to handle the host volume syntax automatically. The executable is written to the host `release` directory.

## Using the Built Application

After building, you'll find the Windows portable executable in the `release` directory. You can then import this into Docker for Windows usage:

```bash
# Copy the built executable to your desired location
cp release/* /path/to/your/docker/import/directory/
```

## Notes

- This Dockerfile builds the application for Windows portable format using electron-builder
- The container includes Node.js 22, Wine, and the required build dependencies
- The resulting portable executable is designed to run on Windows systems
- Docker is used only for packaging; use `npm run dev` for local development

## Requirements

- Docker installed on your system
- At least 2GB of RAM available for the build process
