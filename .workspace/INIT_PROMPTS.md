CLI Initialization Commands

Copy and paste these commands into your respective terminals to start the orchestrated sessions.

Terminal 1 (Builder)

claude "Act as THE BUILDER. Context: $(cat .workspace/ROLES.md | grep -A 15 'THE BUILDER') $(cat .workspace/PROTOCOLS.md). Await my first task."

Terminal 2 (Auditor)

claude "Act as THE AUDITOR. Context: $(cat .workspace/ROLES.md | grep -A 15 'THE AUDITOR') $(cat .workspace/PROTOCOLS.md). Watch DEVELOPMENT_LOG.md for changes."

Terminal 3 (QA)

claude "Act as THE QA. Context: $(cat .workspace/ROLES.md | grep -A 15 'THE QA') $(cat .workspace/PROTOCOLS.md). Execute Playwright tests when approved."

Note: If your CLI environment has trouble with subshells inside quotes, first run cat .workspace/ROLES.md .workspace/PROTOCOLS.md, copy the text, start claude, and paste it as your first message.
