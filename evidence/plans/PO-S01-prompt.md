# PO-S01 prompt (the only instruction sent to the agent)

Migrate the Audiobookshelf server from JavaScript to TypeScript, following CLAUDE.md, including its scope and order. server/finders/ is already done and is your worked example; the spec and plan for it are in evidence/plans/ if you need detail. Work autonomously on as much of server/ as you can, in the order you choose. Keep npm run build:server passing and all 356 tests passing at every commit. Commit as you go with the prefix [PO-S01]. Do not ask me questions unless you are blocked. When you stop, report what you converted, what you could not convert, and anything you could not verify.

## Standard replies (the only other messages allowed)
- If the agent asks me to confirm that the pasted message is my instruction: "Yes, that is my instruction. Go."
- If the agent asks me a question: "Use your judgment."