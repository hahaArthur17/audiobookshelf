# PO-S04 prompt (models pilot)

This is a pilot of about 45 minutes. Follow CLAUDE.md, especially the section "Sequelize models". Convert these three models, one at a time, in this order: server/models/Setting.js, server/models/LibraryFolder.js, server/models/Session.js. The settings classes that Setting.js uses are already converted.
For each model, either convert it so that npm run build:server passes and all 356 tests pass, or restore it and report why. After each model, run the build and the tests, and commit it with the prefix [PO-S04] before you start the next one.
Keep the runtime behaviour the same. The constructors of these models only read fields such as this.key so that JSDoc can type them. Declare the fields with declare so that the Sequelize getters keep working, and leave the constructor statements as they are. Only edit the three model files and, if a declaration is really needed, server/types/. Do not change any other file.
Do not convert any other model, controller or manager in this run. Do not ask me questions unless you are blocked.
When you stop, report for each model: converted or not, the exact init signature and overload you used, how many ! assertions, index signatures and casts you added, and the compiler errors for anything you could not convert. Also say whether the uncallable-overload pattern in CLAUDE.md worked as written, and what you had to change, if anything.

## Standard replies (the only other messages allowed)
- If the agent asks me to confirm that the pasted message is my instruction: "Yes, that is my instruction. Go."
- If the agent asks me a question: "Use your judgment."