# NPI Builder - Docker Build Instructions

This project includes Docker configurations for building the NPI Builder application as a Windows portable executable.

## Prerequisites

- Docker installed on your system
- At least 2GB of RAM available for the build process

## Building the Application

### Using the provided scripts

1. Make sure you have the latest source code
2. Run the appropriate build script:

#### On Linux/macOS:
```bash
chmod +x build-docker.sh
./build-docker.sh
```

#### On Windows (PowerShell):
```powershell
.\build-docker.ps1
```

### Manual Docker Build

Alternatively, you can build manually:

```bash
# Build the Docker image and package the Windows portable executable
mkdir -p release
docker build -t npi-builder .
docker run --rm --volume "$PWD/release:/project/release" npi-builder
```

## What You'll Get

After running the Docker container, you'll find the Windows portable executable in the `release` directory. This executable can be imported and run on Windows systems.

## Notes

- The Wine-enabled Docker container creates a Windows portable version of the application when it runs
- The resulting executable is self-contained and doesn't require installation
- The build may take several minutes depending on your system resources
- Make sure you have sufficient disk space for the build (approximately 2GB)

## Troubleshooting

If you encounter issues during the build process:

1. Ensure Docker is running properly
2. Check that you have sufficient RAM and disk space
3. Re-run the build with `docker build --no-cache -t npi-builder .` if the image cache is stale

## License

This Docker configuration is part of the NPI Builder project and follows the same license as the main project.
