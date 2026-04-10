#!/bin/bash
# Deployment script for Spendrax on EC2
# Usage: ./deploy.sh [environment]

set -e

ENVIRONMENT=${1:-prod}
APP_DIR="/opt/spendrax"
COMPOSE_FILE="docker-compose.prod.yml"

echo "=========================================="
echo "Deploying Spendrax - Environment: $ENVIRONMENT"
echo "=========================================="

cd $APP_DIR

# Pull latest code
echo "[1/5] Pulling latest code from Git..."
git fetch origin
git reset --hard origin/main

# Copy environment file if exists
if [ -f ".env.prod" ]; then
    cp .env.prod backend/.env
fi

# Build and deploy
echo "[2/5] Building Docker images..."
docker compose -f $COMPOSE_FILE build --no-cache

echo "[3/5] Stopping existing containers..."
docker compose -f $COMPOSE_FILE down || true

echo "[4/5] Starting new containers..."
docker compose -f $COMPOSE_FILE up -d

# Wait for health check
echo "[5/5] Waiting for services to be healthy..."
sleep 10

# Check if services are running
if docker compose -f $COMPOSE_FILE ps | grep -q "Up"; then
    echo ""
    echo "=========================================="
    echo "Deployment successful!"
    echo "=========================================="
    docker compose -f $COMPOSE_FILE ps
    echo ""
    echo "Backend health check:"
    curl -s http://localhost:8001/api/health || echo "Backend not responding yet..."
else
    echo "Deployment failed! Checking logs..."
    docker compose -f $COMPOSE_FILE logs --tail=50
    exit 1
fi

# Cleanup old images
echo ""
echo "Cleaning up old Docker images..."
docker image prune -f

echo ""
echo "Deployment complete at $(date)"
