#!/bin/bash
cd /Users/frederic/ProjetsDev/counselai-v2/backend
source venv/bin/activate

# Run uvicorn with production settings
# --timeout-keep-alive: Keep-alive timeout in seconds (default 5)
# --timeout-graceful-shutdown: Maximum wait time for graceful shutdown
# --limit-concurrency: Maximum number of concurrent connections
# --workers: Number of worker processes (for better concurrency)
uvicorn main:app \
    --host 0.0.0.0 \
    --port 8001 \
    --timeout-keep-alive 120 \
    --timeout-graceful-shutdown 30 \
    --limit-concurrency 1000 \
    --workers 4