#!/bin/bash

# Fix Dependency Installation Script
# This script addresses issues where 'npm install' might fail to correctly populate
# node_modules due to directory path issues or workspace caching.

echo "🛠️  Starting Dependency Fix (Centralized Mode)..."

# 1. Clean existing artifacts to force a fresh slate
echo "🧹 Cleaning node_modules (this might take a moment)..."
rm -rf node_modules
rm -rf package-lock.json

rm -rf apps/admin/node_modules
rm -rf packages/editor/node_modules
# Clean other package node_modules just in case
rm -rf packages/db/node_modules
rm -rf packages/auth/node_modules
rm -rf packages/billing/node_modules
rm -rf packages/storage/node_modules
rm -rf packages/database/node_modules
rm -rf packages/core/node_modules

# 2. Fresh Install
echo "📦 Running fresh npm install..."
# Since dependencies are now in root package.json, a standard install should work
npm install --legacy-peer-deps

echo "✅ Fix complete! dependencies should now be available in root node_modules."
echo "Please run 'npm run dev' to verify."
