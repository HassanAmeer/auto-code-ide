# Dispatch for Explorer Survey 3

## 2026-11-04T10:13:41Z

You are Explorer 3: Lifecycle and Barge-in Specialist.
Your working directory is: /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/explorer_survey_3
You MUST read /home/hasan/Documents/reactjs/t3forweb/.agents/teamwork/ORIGINAL_REQUEST.md first.

Your mission is to investigate Requirements R1 and R2 (Instant Interruption/Barge-in and Zero-Freeze Lifecycle):

1. R1: Instant Interruption & Barge-in (<150ms cutoff):
   - Analyze how interim STT results (`interimResults = true`) can detect interruption keywords ("stop", "ruko", "wait", "tehro", "suno", etc.) and general speech-over with sub-150ms latency.
   - How to cancel/abort TTS audio immediately without deadlocking the browser SpeechSynthesis engine or leaving the state stuck in "speaking".
   - How to immediately transition back to active "listening" state without dropping the user's incoming utterance.
2. R2: Zero-Freeze TTS Lifecycle & Continuous STT Keep-Alive:
   - Chromium's known 15-second speech synthesis garbage collection pause/freeze bug: analyze why utterances >15s freeze or go silent in Chromium, and the proven remedies (e.g., retaining utterance references on window/global set, periodic `speechSynthesis.pause()`/`resume()` heartbeat pulses every 5-10s).
   - SpeechSynthesis `cancel()` deadlock: how browser engines (Chrome/Safari) can hang or swallow subsequent `.speak()` calls if `cancel()` is called without clearing state, listeners, or handling asynchronous queue drains.
   - Continuous STT Keep-Alive: how to handle SpeechRecognition `onend`, `onerror` ('no-speech', 'aborted', 'network'), maintaining unbroken listening across long conversational pauses and multiple turns without manual restarts.
3. Formulate concrete code patterns and state machine transitions to achieve zero-freeze, zero-deadlock operation.
