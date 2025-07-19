# Timeout Configuration Guide

## Overview
The application is configured to handle long-running requests (up to 3 minutes) for complex contract generation and modification operations.

## Frontend Configuration
- **Contract Generation**: 180 seconds (3 minutes) timeout
- **Contract Modification**: 120 seconds (2 minutes) timeout
- Uses AbortController for proper request cancellation
- Provides user-friendly error messages on timeout

## Backend Configuration

### Development Mode
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

### Production Mode
```bash
uvicorn main:app \
    --host 0.0.0.0 \
    --port 8001 \
    --timeout-keep-alive 120 \
    --timeout-graceful-shutdown 30 \
    --limit-concurrency 1000 \
    --workers 4
```

## Additional Server Configuration

### Nginx (if used as reverse proxy)
Add these settings to your nginx configuration:
```nginx
location /api/ {
    proxy_pass http://localhost:8001;
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
    proxy_send_timeout 300s;
    send_timeout 300s;
    
    # Other proxy settings
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

### Apache (if used as reverse proxy)
```apache
ProxyTimeout 300
ProxyPass /api/ http://localhost:8001/
ProxyPassReverse /api/ http://localhost:8001/
```

### Cloud Providers
- **AWS ALB**: Set idle timeout to 300 seconds
- **Google Cloud Load Balancer**: Set backend timeout to 300 seconds
- **Azure Application Gateway**: Set request timeout to 300 seconds

## Notes
- The Gemini API itself may have its own timeout limits
- Consider implementing progress indicators for long operations
- For extremely long operations, consider implementing a job queue system