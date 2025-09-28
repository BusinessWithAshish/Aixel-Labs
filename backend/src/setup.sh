#!/bin/bash

echo "🚀 Starting EC2 setup..."
LOGFILE="/var/log/aixellabs-setup.log"
exec > >(tee -a $LOGFILE) 2>&1

# Update system
echo "🔄 Updating system..."
sudo apt-get update -y
sudo apt-get upgrade -y

# Install Git
echo "📦 Installing Git..."
sudo apt-get install -y git

# Install Node.js and npm (latest LTS from NodeSource)
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm globally
echo "📦 Installing pnpm..."
sudo npm install -g pnpm

# Install Chromium
echo "🌐 Installing Chromium..."
sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium

sudo git clone https://github.com/BusinessWithAshish/aixellabs-BE.git
cd aixellabs-BE

# Install project dependencies
echo "📂 Installing project dependencies..."
pnpm install

# Create .env file
echo "📝 Creating .env file..."
cat <<EOF > .env
PORT=${PORT}
NODE_ENV=${NODE_ENV}
MAX_BROWSER_SESSIONS=${MAX_BROWSER_SESSIONS}
MAX_PAGES_PER_BROWSER=${MAX_PAGES_PER_BROWSER}
GOOGLE_MAPS_PLACES_API_KEY=${GOOGLE_MAPS_PLACES_API_KEY}
EOF

echo "✅ .env file created successfully!"

# Start the app
echo "🎯 Starting Node.js application..."
pnpm run start

echo "🎉 Setup complete! Logs available at $LOGFILE"