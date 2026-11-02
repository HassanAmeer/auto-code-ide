# AUTONOMOUS AGENT HARNESS & DEEPSEEK WORKER MODULES

Yeh directory (`apps/server/src/dsh/`) **DeepSeek Router-Worker Prototype (DSH)** aur **Autonomous Execution Engine** ka isolated, modular core hai.

---

## 📁 File Structure & Purpose (Future Reference)

| File                    | Purpose                                                                                                                         |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| **`index.ts`**          | Master Orchestrator: Worktree allocation se le kar review loop aur auto-WhatsApp delivery tak ka mukammal workflow chalata hai. |
| **`worktreeRunner.ts`** | Local Git Worktrees (`git worktree add/merge/remove`) manage karta hai taake main branch ka code safe rahe.                     |
| **`selfReviewLoop.ts`** | 3-Level Autonomous Testing: Terminal build errors, Preview HTTP 200 health, aur Prompt Checklist vs Git diff audit.             |
| **`opencodeBridge.ts`** | Local OpenCode daemon (port 4099/45991) ke sessions mein prompt dispatch karke headless code generation karwata hai.            |
| **`types.ts`**          | Task stages, review rounds, aur checklist state machine definitions.                                                            |

---

## 🚀 How It Works (4-Step Lifecycle)

1. **Worktree Isolation:** `createWorkerWorktree` isolated branch `.worktrees/worker-${id}` banata hai.
2. **OpenCode Coding:** `executeOpenCodeTask` us worktree mein code generate karta hai.
3. **3-Level Self-Review:** `executeAutonomousReviewLoop` syntax, preview, aur requirements check karke auto-heal karta hai (Max 3 rounds).
4. **Safe Merge & Notify:** `mergeWorkerWorktree` code ko main branch mein merge karta hai aur priority client (0349) ko WhatsApp preview notification bhejta hai.
