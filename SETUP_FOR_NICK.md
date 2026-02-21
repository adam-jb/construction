# Setup Guide for Testing

## Quick Start

### 1. Prerequisites
- **Python 3.12** installed
- **Node.js 18+** installed
- **Environment variables** (check Discord DM for `.env` file with API keys)

### 2. Backend Setup
```powershell
# From project root
cd backend

# Create virtual environment (if not exists)
python -m venv ../.venv

# Activate virtual environment
../.venv/Scripts/Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Copy .env file to project root (from Discord DM)
# Should contain: OPENROUTER_API_KEY, OPENAI_API_KEY, PINECONE_API_KEY, R2_*

# Start backend server
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend will be available at: **http://localhost:8000**

### 3. Frontend Setup
```powershell
# Open new terminal, from project root
cd frontend

# Install dependencies (first time only)
npm install

# Start development server
npm run dev
```

Frontend will be available at: **http://localhost:5173**

## Testing Guide

### Features to Test
1. **Document Upload** - Click "+ Add documents" in left panel
2. **Document Selection** - Check documents you want to query against
3. **Chat Query** - Ask questions about selected documents
4. **Reference Clicking** - Click citation badges below AI responses to view source in PDF viewer
5. **PDF Highlighting** - Should see relevant text highlighted in yellow
6. **Panel Resizing** - Drag edges of left/right panels to resize

### Known Issues
- ⚠️ **Backend performance is currently slow** (~7 minutes per query)
  - This is due to the 11-step pipeline with multiple LLM calls
  - Performance optimization is next priority
- First query may take longer while services initialize

### What's Working
✅ PDF upload and processing  
✅ Document management (rename, delete, select)  
✅ Multi-turn conversations with context  
✅ Reference extraction and citation  
✅ PDF viewer with text highlighting  
✅ Resizable panels  

### Troubleshooting

**Backend won't start:**
- Make sure `.env` file is in project root (not in `backend/` folder)
- Check all API keys are set without quotes

**Frontend shows errors:**
- Check `frontend/.env.local` doesn't have `VITE_USE_MOCK_API=true`
- Verify backend is running on port 8000

**Query takes forever:**
- This is expected (currently ~7 mins per query)
- Don't refresh the page while query is processing
- Backend terminal will show progress logs

## Feedback Needed
- Overall UX impressions
- Any crashes or errors (check browser console)
- UI/design suggestions
- Feature requests

See browser console (F12) and backend terminal for detailed logs if issues occur.
