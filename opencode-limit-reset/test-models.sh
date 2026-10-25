#!/usr/bin/env bash
# ==============================================================================
# OpenCode Free Models Full Validation Suite
# ==============================================================================

SERVER_URL=${1:-"http://127.0.0.1:4099"}
AUTH_HEADER="Authorization: Basic $(echo -n 'opencode:autocode123' | base64)"

MODELS=(
  "deepseek-v4.1-flash-free"
  "beam-free"
  "glm-5.3-flash-free"
  "flint-40b-free"
  "mimo-v2.6-flash-free"
  "nemotron-3.5-lightning-free"
)

echo "======================================================"
echo " Validating OpenCode Free Tier Models on: $SERVER_URL"
echo "======================================================"

for MODEL in "${MODELS[@]}"; do
  echo -e "\n------------------------------------------------------"
  echo " Testing Model: $MODEL"
  echo "------------------------------------------------------"
  
  START_TIME=$(date +%s%N)
  
  # 1. Create Session
  SESSION_RESP=$(curl -s -X POST "${SERVER_URL}/api/session" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "{\"model\":{\"id\":\"${MODEL}\",\"providerID\":\"opencode\"}}")
    
  SESSION_ID=$(echo "$SESSION_RESP" | jq -r .data.id 2>/dev/null)
  
  if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "null" ]; then
    echo " ❌ Session creation failed: $SESSION_RESP"
    continue
  fi
  
  echo " ✓ Session Created: $SESSION_ID"
  
  # 2. Submit Prompt
  PROMPT_RESP=$(curl -s -X POST "${SERVER_URL}/api/session/${SESSION_ID}/prompt" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d '{"text":"Explain recursion in 10 words or less."}')
    
  echo " ✓ Prompt Submitted. Streaming response..."
  
  # 3. Poll for Output (up to 12 seconds)
  ASSISTANT_TEXT=""
  REASONING_TEXT=""
  ERR_MSG=""
  
  for ATTEMPT in {1..12}; do
    sleep 1
    MSG_RESP=$(curl -s -X GET "${SERVER_URL}/api/session/${SESSION_ID}/message" \
      -H "$AUTH_HEADER")
      
    ASSISTANT_TEXT=$(echo "$MSG_RESP" | jq -r '.[].[] | select(.type=="assistant") | .content[] | select(.type=="text") | .text' 2>/dev/null | head -n 1)
    REASONING_TEXT=$(echo "$MSG_RESP" | jq -r '.[].[] | select(.type=="assistant") | .content[] | select(.type=="reasoning") | .text' 2>/dev/null | head -n 1)
    ERR_MSG=$(echo "$MSG_RESP" | jq -r '.[].[] | select(.outcome=="failed") | .error.message' 2>/dev/null | head -n 1)
    
    if [ -n "$ASSISTANT_TEXT" ] || [ -n "$ERR_MSG" ]; then
      break
    fi
  done
  
  END_TIME=$(date +%s%N)
  DURATION=$(( (END_TIME - START_TIME) / 1000000 ))
  
  if [ -n "$ASSISTANT_TEXT" ]; then
    echo " ✅ SUCCESS [${DURATION}ms]:"
    if [ -n "$REASONING_TEXT" ]; then
      echo "    Thinking: $REASONING_TEXT"
    fi
    echo "    Output:   $ASSISTANT_TEXT"
  elif [ -n "$ERR_MSG" ]; then
    echo " ❌ ERROR: $ERR_MSG"
  else
    echo " ⚠️ Status: Generating or timed out after 12s."
  fi
done

echo -e "\n======================================================"
echo " Validation complete."
echo "======================================================"
