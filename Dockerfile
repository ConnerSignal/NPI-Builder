# The official electron-builder image includes Wine, which is required to
# produce Windows installers from a Linux container.
FROM electronuserland/builder:22-wine

# Set working directory
WORKDIR /project

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci

# Copy application source code
COPY . .

# Build at container runtime so a bind-mounted release directory receives the
# generated portable executable.
CMD ["npm", "run", "dist:win"]
