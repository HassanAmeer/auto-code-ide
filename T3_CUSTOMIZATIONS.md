# T3 Code - Complete Modifications & Custom Features Guide

Yeh document T3 Code (`pingdotgg/t3code`) ke original codebase se le kar ab tak ki tamam modifications, newly added features, UI/UX changes, server endpoints, aur architectural updates ki mukammal tafseel provide karta hai. Agar aap project ko fresh clone kar ke dobara banana ya re-apply karna chahein, to yeh guide aapke liye step-by-step blueprint ka kaam karegi.

---

## 📑 Fihrist (Table of Contents)

1. [Project Overview & Main Goal](#1-project-overview--main-goal)
2. [Key Features & Additions](#2-key-features--additions)
   - [A. Self-Hosted VPS & Web Decoupling](#a-self-hosted-vps--web-decoupling)
   - [B. Speech-to-Text (STT) & Text-to-Speech (TTS)](#b-speech-to-text-stt--text-to-speech-tts)
   - [C. Live Voice Call Assistant Mode](#c-live-voice-call-assistant-mode)
   - [D. Project Management (Zip Upload, Folder Import, Git Clone)](#d-project-management-zip-upload-folder-import-git-clone)
   - [E. Embedded AI Terminal Execution](#e-embedded-ai-terminal-execution)
   - [F. Custom Providers & Web Search Research Agent](#f-custom-providers--web-search-research-agent)
   - [G. Sidebar & Project Navigation Enhancements](#g-sidebar--project-navigation-enhancements)
   - [H. Chat Composer & Send Button Robustness](#h-chat-composer--send-button-robustness)
   - [I. Custom Storage & Workspace Configuration](#i-custom-storage--workspace-configuration)
   - [J. Lightweight Cleanup of Unused Native/Desktop Modules](#j-lightweight-cleanup-of-unused-nativedesktop-modules)
3. [File-by-File Detailed Mapping](#3-file-by-file-detailed-mapping)
4. [Step-by-Step Guide: Fresh Clone Se Re-apply Karne Ka Tariqa](#4-step-by-step-guide-fresh-clone-se-re-apply-karne-ka-tariqa)

---

## 1. Project Overview & Main Goal

### Asal Maqsad (Motivation):

Original T3 Code ek Electron-first desktop application thi jo local network ya Tailscale pairing ke zariye mobile/web client ko serve karti thi. Is me multiple constraints the:

- Browser se direct bina pairing token ke use karna mushkil tha.
- VPS ya cloud server par self-host karne ke liye built-in Docker support nahi tha.
- Voice input / speech support nahi thi (khas tor par Urdu aur Roman Urdu ke liye).
- Project create ya import karne ke liye manual filesystem path specify karna parta tha (browser se zip upload ya direct clone nahi tha).
- Sidebar sirf threads render karta tha; agar project me 0 chats hon to project ghaib ho jata tha.
- Send button bohot si security/scope aur provider checks ki wajah se disable ho jata tha.

### Solution:

T3 Code ko ek modern, standalone, cloud-ready aur feature-rich web platform mein dhal diya gaya.

---

## 2. Key Features & Additions

### A. Self-Hosted VPS & Web Decoupling

- **Files:** `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `SELF_HOSTED_GUIDE.md`, `pnpm-workspace.docker.yaml`, `apps/server/src/auth/ReusableDevAuth.ts`
- **Tafseel:**
  - Frontend aur server ko containerize kiya gaya taake `docker compose up -d` ke sath kisi bhi VPS (Ubuntu/Debian) par deploy kiya ja sake.
  - Tailscale aur device-pairing ka compulsory barrier khatam kiya gaya. Single-origin proxy setup kiya gaya taake browser direct web port se `/api` aur `/ws` ko access kar sake bina kisi token validation ke atack mein phasay.
  - Development aur production dono me single origin URL handling ensure ki gayi.

---

### B. Speech-to-Text (STT) & Text-to-Speech (TTS)

- **Supported Languages:** **Roman Urdu**, **Natural Urdu (اردو)**, aur **English**.
- **Files Added:**
  - `apps/web/src/lib/speech/stt.ts`: Browser SpeechRecognition API wrapper with continuous recognition, silence detection, aur automated punctuation.
  - `apps/web/src/lib/speech/tts.ts`: SpeechSynthesis wrapper with speech queueing, rate/pitch/volume control, voice selection.
  - `apps/web/src/lib/speech/romanUrduTransliterate.ts`: Roman Urdu phonetic transliteration helper.
  - `apps/web/src/components/chat/ComposerMicButton.tsx`: Composer mein microphone button jo real-time recording state aur pulsing wave animation show karta hai.
  - `apps/web/src/components/chat/ReadAloudButton.tsx`: Har message card ke sath "Read Aloud" button jo AI ke reply ko speak out karta hai.
  - `apps/web/src/components/settings/SttTtsSettingsPanel.tsx`, `SttSettingsPanel.tsx`, `TtsSettingsPanel.tsx`: Settings panel jahan se user language, voice, speed, auto-read responses toggle kar sakta hai.
  - Routes: `/settings/stt`, `/settings/tts`, `/settings/stt-tts`.

---

### C. Live Voice Call Assistant Mode

- **Files Added:**
  - `apps/web/src/components/chat/voiceCall/VoiceCallButton.tsx`: Interactive Phone Call button in ChatComposer and header.
  - `apps/web/src/components/chat/voiceCall/VoiceVisualizerWaves.tsx`: Real-time audio waveform visualizer (Agent talking vs User speaking).
  - `apps/web/src/components/chat/voiceCall/thinkingAmbientSound.ts`: Ambient audio feedback jab AI model turn process kar raha ho.
  - `apps/web/src/components/chat/voiceCall/useVoiceCallAssistant.ts`: Autonomous turn-taking engine (User bolta hai -> Silence detect ho kar auto-send hota hai -> AI response ko TTS read karta hai -> Fauran wapas listening state active ho jati hai).
  - `apps/web/src/components/chat/voiceCall/voiceCallSettings.ts`: Call settings store.

---

### D. Project Management (Zip Upload, Folder Import, Git Clone)

- **Files Added / Modified:**
  - `apps/web/src/state/projectUploadProgress.ts` & `GlobalProjectImportProgress.tsx`: Project upload progress tracking (percentage bar, file extraction status).
  - `apps/web/src/hooks/useImportLocalProject.ts` & `useNewProject.ts`: Local zip extract aur project initialization logic.
  - `apps/web/src/components/project/projectCreateModalStore.ts`: Project create modal.
  - Sidebar aur Welcome wizard me buttons:
    - **"Create new project"** (Empty template initialize karna)
    - **"Upload .zip project"** (Browser se zip drag & drop / pick kar ke server par extract karwana)
    - **"Import / Add local project"** (Filesystem directory ya Git repo clone karna)

---

### E. Embedded AI Terminal Execution

- **Files Added:**
  - `apps/server/src/terminalExec.ts`: Node.js child_process runner jo bash/sh commands execute karta hai aur stdout/stderr stream karta hai.
  - `apps/server/src/http.ts`: Server routes `/api/terminal/exec` aur `/api/terminal/cwd`.
  - `apps/web/src/components/chat/terminal/terminalClient.ts`, `terminalStore.ts`, `terminalTypes.ts`: Client state aur HTTP runner.
  - `apps/web/src/components/chat/terminal/AiTerminalCommandBar.tsx`: Floating / sticky command bar chat ke andar jahan se terminal commands run ki ja sakti hain.
  - `apps/web/src/components/chat/terminal/TerminalFeed.tsx`: Command execution history aur live output feed.

---

### F. Custom Providers & Web Search Research Agent

- **Files Added / Modified:**
  - `apps/web/src/lib/customProviders.ts`: Custom provider registry (OpenAI-compatible endpoints, Anthropic, Ollama, OpenCode).
  - `apps/web/src/components/settings/CustomProvidersSettingsPanel.tsx`: UI for entering custom Base URLs, API keys, model IDs.
  - `apps/web/src/components/settings/ResearchAgentSettings.tsx`: Agent web search toggle aur external knowledge reach options.
  - Routes: `/settings/custom-providers`.

---

### G. Sidebar & Project Navigation Enhancements

- **Files Modified:** `apps/web/src/components/Sidebar.tsx`, `SidebarChrome.tsx`, `SidebarThreadHeader.tsx`
- **Changes:**
  - **Project Quick-Switch Chips:** Sidebar search bar ke niche horizontal scrollable chips (`All`, `[Project 1]`, `[Project 2]`, ...) add kiye gaye taake kisi bhi project par 1-click se switch kiya ja sake.
  - **Empty State Enhancement (Chahe 0 Chat hon):** Agar project me koi thread/chat na ho, pehle sidebar sirf "No threads yet" dikha kar blank ho jata tha. Ab tamam projects unke Favicon, Name, aur "Active" / "Select" action button ke sath list hote hain.
  - **Always-Enabled New Thread Button:** `newThreadDisabled={false}` set kiya gaya taake baghair project select kiye ya empty project hone par bhi New Thread button disable na ho.

---

### H. Chat Composer & Send Button Robustness

- **Files Modified:**
  - `apps/web/src/components/chat/ChatComposer.tsx`
  - `apps/web/src/components/chat/ComposerPrimaryActions.tsx`
  - `apps/web/src/components/ChatView.tsx`
  - `apps/web/src/components/chat/DraftHeroHeadline.tsx`
- **Changes:**
  - **No Disabled Send Button:** Send button se tamam blocking conditions (`isSendDisabled`, `sendDisabledReason`, `isConnecting`, `projectSelectionRequired`, `environmentUnavailable`) bypass kar di gayin. Jaise hi user text type karta hai, send button fauran clickable aur active hota hai.
  - **Selected Project Live Badge:** Draft chat view ke top par prominent badge add kiya gaya:
    `Selected Project: <Project Name>` (pulsing green dot ke sath), taake user ko clear pata chale ke konsa project active hai.
  - **Safe Project Fallback:** Agar koi project explicitly draft thread se bound na ho, to `ChatView.tsx` automatically user ke latest available project ko target karta hai ya scratch project create kar leta hai, taake send kabhi fail na ho.

---

### I. Custom Storage & Workspace Configuration

- **Files Modified / Added:**
  - `apps/web/src/components/settings/StorageSettings.tsx`
  - `apps/server/src/project/ManagedProjectFolders.ts`
  - Route: `/settings/storage`
- **Changes:**
  - Environment variables `T3CODE_WORKSPACE_DIR` aur `T3CODE_PROJECTS_DIR` ke zariye custom workspace folder configure karne ki capability.

---

### J. Lightweight Cleanup of Unused Native/Desktop Modules

- **Files Deleted / Pruned:**
  - `native/hyprland-snap-shot/` (Linux Hyprland window screenshot utility)
  - `native/kde-snap-shot/` (KDE KWin screenshot utility)
  - `native/libghostty-vt/` (C/Zig virtual terminal library)
  - `native/resource-monitor/` (Rust resource monitor)
  - `packaging/aur/` (Arch Linux packaging scripts)
  - `scripts/convert-device-model.py`, `scripts/mobile-showcase*`
- **Kyun Kiya Gaya:** Yeh native C/Rust/Zig dependencies Linux VPS aur web builds par unnecessary compile errors aur heavy dependencies create kar rahi theen, jabke hum web client par focus kar rahe hain.

---

## 3. File-by-File Detailed Mapping

| File Path                                                           | Action    | Description / Maqsad                                                                                                                         |
| ------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/chat/ComposerPrimaryActions.tsx`           | Modified  | Send button ke disabled state ko unblock kiya (`disabled={!hasSendableContent}`). Mic button aur Cancel button integrate kiye.               |
| `apps/web/src/components/chat/ChatComposer.tsx`                     | Modified  | `isSendDisabled = false`, `sendDisabledReason = null`, STT mic integration, AI terminal bar placement, voice call trigger.                   |
| `apps/web/src/components/ChatView.tsx`                              | Modified  | Fallback project auto-binding on send, permission checks bypass (`canOperateThread = true`), AI terminal command bar floating/docked layout. |
| `apps/web/src/components/chat/DraftHeroHeadline.tsx`                | Modified  | `Selected Project: <Name>` prominent badge with live status dot.                                                                             |
| `apps/web/src/components/Sidebar.tsx`                               | Modified  | Project quick-switch pills in header, empty state me projects ki full list render karna, `newThreadDisabled={false}`.                        |
| `apps/web/src/components/sidebar/SidebarChrome.tsx`                 | Modified  | Sidebar top header navigation & project indicators.                                                                                          |
| `apps/web/src/lib/speech/stt.ts`                                    | **Added** | Web Speech STT engine (Roman Urdu, Natural Urdu, English).                                                                                   |
| `apps/web/src/lib/speech/tts.ts`                                    | **Added** | Web Speech TTS audio synthesis engine.                                                                                                       |
| `apps/web/src/lib/speech/romanUrduTransliterate.ts`                 | **Added** | Roman Urdu transliteration processor.                                                                                                        |
| `apps/web/src/components/chat/ComposerMicButton.tsx`                | **Added** | Composer mic toggle button with recording animations.                                                                                        |
| `apps/web/src/components/chat/ReadAloudButton.tsx`                  | **Added** | Chat message bubble audio read aloud button.                                                                                                 |
| `apps/web/src/components/chat/voiceCall/*`                          | **Added** | Voice assistant mode (waves visualizer, ambient sound, turn-taking hook).                                                                    |
| `apps/web/src/components/chat/terminal/*`                           | **Added** | AI terminal client, command bar, terminal feed, store.                                                                                       |
| `apps/server/src/terminalExec.ts`                                   | **Added** | Server-side child_process execution engine.                                                                                                  |
| `apps/server/src/http.ts`                                           | Modified  | Terminal execution routes (`/api/terminal/exec`, `/api/terminal/cwd`).                                                                       |
| `apps/server/src/auth/EnvironmentAuth.ts`                           | Modified  | Bypass strict remote pairing authentication for single-origin web access.                                                                    |
| `apps/server/src/ws.ts`                                             | Modified  | Relaxed WebSocket authentication checks for web self-hosted clients.                                                                         |
| `apps/server/src/project/ManagedProjectFolders.ts`                  | Modified  | Support for custom project roots and safe workspace creation.                                                                                |
| `apps/web/src/state/projectUploadProgress.ts`                       | **Added** | Zip upload and project extraction progress store.                                                                                            |
| `apps/web/src/components/project/GlobalProjectImportProgress.tsx`   | **Added** | Floating progress bar for project uploading/extracting.                                                                                      |
| `apps/web/src/components/settings/SttTtsSettingsPanel.tsx`          | **Added** | Unified Voice & Speech settings panel.                                                                                                       |
| `apps/web/src/components/settings/CustomProvidersSettingsPanel.tsx` | **Added** | Custom AI model / provider configuration panel.                                                                                              |
| `apps/web/src/components/settings/StorageSettings.tsx`              | **Added** | Custom workspace directory settings panel.                                                                                                   |
| `Dockerfile` & `docker-compose.yml`                                 | **Added** | Docker containerization for one-command deployment.                                                                                          |
| `SELF_HOSTED_GUIDE.md`                                              | **Added** | Comprehensive deployment manual for VPS / Cloud servers.                                                                                     |

---

## 4. Step-by-Step Guide: Fresh Clone Se Re-apply Karne Ka Tariqa

Agar aap fresh T3 Code repo (`git clone https://github.com/pingdotgg/t3code.git`) se dobara shuru karein, to in steps ko follow karein:

### Step 1: Dependencies Setup

```bash
bun install  # ya pnpm install
```

### Step 2: Unused Native Packages Remove Karna (Optional but Recommended)

Agar aapko Linux native tools (Ghostty, Hyprland, KDE) compile karne ki zaroorat nahi hai, to `native/` folder se unused directories remove kar dein taake build fast aur lean rahe.

### Step 3: Web-Decoupling & Single-Origin Proxy

1. `vite.config.ts` me `/api` aur `/ws` proxies ensure karein taake browser direct server port se communicate kare.
2. `apps/server/src/auth/EnvironmentAuth.ts` aur `apps/server/src/ws.ts` mein dev token bypass add karein taake pairing link ka jhanjhat na rahe.

### Step 4: Speech Engine (STT/TTS) Copy Karna

1. `apps/web/src/lib/speech/` folder copy karein (`stt.ts`, `tts.ts`, `romanUrduTransliterate.ts`).
2. `apps/web/src/components/chat/ComposerMicButton.tsx` aur `ReadAloudButton.tsx` add karein.
3. `ChatComposer.tsx` aur `ComposerPrimaryActions.tsx` me mic button place karein.

### Step 5: Voice Call Assistant Mode

1. `apps/web/src/components/chat/voiceCall/` folder copy karein.
2. `ChatComposer.tsx` ke actions bar me `VoiceCallButton` include karein.

### Step 6: Project Import & Zip Upload System

1. `apps/web/src/state/projectUploadProgress.ts` aur `GlobalProjectImportProgress.tsx` add karein.
2. `Sidebar.tsx` aur `SidebarThreadHeader.tsx` me "Upload .zip project" aur "Create new project" buttons bind karein.

### Step 7: AI Terminal Engine

1. `apps/server/src/terminalExec.ts` banayein aur `apps/server/src/http.ts` mein `/api/terminal/exec` route expose karein.
2. `apps/web/src/components/chat/terminal/` folder add karein aur `ChatView.tsx` mein `AiTerminalCommandBar` render karein.

### Step 8: Sidebar & Composer Fixes

1. **Sidebar:**
   - `Sidebar.tsx` me `newThreadDisabled={false}` set karein.
   - Header ke niche quick-switch project pills add karein.
   - Empty state me projects ki list (`projectGroups.map(...)`) render karein.
2. **Draft Headline:**
   - `DraftHeroHeadline.tsx` me `Selected Project: <Name>` badge add karein.
3. **Send Button:**
   - `ComposerPrimaryActions.tsx` me `disabled={!hasSendableContent}` set karein.
   - `ChatComposer.tsx` me `isSendDisabled = false` aur `sendDisabledReason = null` set karein.
   - `ChatView.tsx` me `onSend` handler me fallback project target karein agar draft se project attached na ho.

---

Yeh document project root mein [T3_CUSTOMIZATIONS.md](file:///home/hasan/Documents/reactjs/t3forweb/T3_CUSTOMIZATIONS.md) ke tor par save kiya gaya hai.
