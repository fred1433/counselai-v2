#!/bin/bash
cd /Users/frederic/ProjetsDev/counselai-v2/backend
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8001