FROM node:20-slim

# Install yt-dlp and ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install dependencies
RUN npm install

# Copy backend source code
COPY backend/ ./

# Create downloads directory
RUN mkdir -p downloads

# Expose port
EXPOSE 8000

ENV PORT=8000

# Start the server
CMD ["npm", "start"]


