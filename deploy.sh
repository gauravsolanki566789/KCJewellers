#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "Starting deployment process..."

echo "1/5: Fetching and resetting git..."
git fetch --all
git reset --hard origin/master

echo "2/5: Running database migrations..."
npm run migrate

echo "3/5: Navigating to client and cleaning up old build..."
cd client
rm -rf .next

echo "4/5: Installing dependencies and building Next.js..."
npm install
npm run build

echo "5/5: Returning to root and restarting PM2..."
cd ..
pm2 restart all

echo "✅ Deployment completed successfully!"