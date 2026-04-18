CLI Initialization Commands

Copy and paste these commands into your respective terminals to start the orchestrated sessions.

Terminal 1 (Builder)

claude --system "$(cat ROLES.md | grep -A 10 'THE BUILDER') $(cat PROTOCOLS.md)"

Terminal 2 (Auditor)

claude --system "$(cat ROLES.md | grep -A 10 'THE AUDITOR') $(cat PROTOCOLS.md)"

Terminal 3 (QA)

claude --system "$(cat ROLES.md | grep -A 10 'THE QA') $(cat PROTOCOLS.md)"

Note: If your CLI doesn't support subshells, manually copy the text from ROLES.md and PROTOCOLS.md into the system prompt.
