#!/bin/bash

echo "🧪 Testing Data Management API Pagination"
echo "=========================================="

# Get auth token
echo "📝 Logging in..."
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:8000/users/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"povtuas@gmail.com","password":"123456789"}')

TOKEN=$(echo $TOKEN_RESPONSE | grep -o '"access":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "❌ Login failed!"
    echo "Response: $TOKEN_RESPONSE"
    exit 1
fi

echo "✅ Login successful! Token: ${TOKEN:0:20}..."

# Get projects
echo ""
echo "📁 Getting projects..."
PROJECTS=$(curl -s http://localhost:8000/storage/projects/ \
  -H "Authorization: Bearer $TOKEN")

PROJECT_ID=$(echo $PROJECTS | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Found project ID: $PROJECT_ID"

# Get project tree
echo ""
echo "🌳 Getting project tree..."
TREE=$(curl -s "http://localhost:8000/storage/projects/$PROJECT_ID/tree/" \
  -H "Authorization: Bearer $TOKEN")

echo "Tree response length: $(echo $TREE | wc -c) characters"

# Look for folders with many files
FOLDER_IDS=$(echo $TREE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

echo ""
echo "📂 Testing folder contents with pagination..."

for FOLDER_ID in $FOLDER_IDS; do
    echo "Testing folder: $FOLDER_ID"
    
    CONTENTS=$(curl -s "http://localhost:8000/storage/folders/$FOLDER_ID/contents/?page=1&page_size=5" \
      -H "Authorization: Bearer $TOKEN")
    
    TOTAL=$(echo $CONTENTS | grep -o '"total":[0-9]*' | cut -d':' -f2)
    TOTAL_PAGES=$(echo $CONTENTS | grep -o '"total_pages":[0-9]*' | cut -d':' -f2)
    
    if [ ! -z "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
        echo "✅ Folder $FOLDER_ID: $TOTAL files, $TOTAL_PAGES pages"
        
        if [ "$TOTAL" -gt 10 ]; then
            echo "🎯 Found folder with many files! Testing page 2..."
            PAGE2=$(curl -s "http://localhost:8000/storage/folders/$FOLDER_ID/contents/?page=2&page_size=5" \
              -H "Authorization: Bearer $TOKEN")
            PAGE2_FILES=$(echo $PAGE2 | grep -o '"files":\[[^]]*\]' | wc -c)
            echo "   Page 2 response size: $PAGE2_FILES characters"
            break
        fi
    fi
done

echo ""
echo "🏁 API testing complete!"