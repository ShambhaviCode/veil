🕯️ VEIL

Privacy-Preserving Campus Incident Reporting

VEIL lets a verified member of an institution prove they're eligible to report — without unnecessarily revealing who they are.

Speak up. Stay private.

💡 Inspiration

Anonymous reporting has a difficult trade-off.

If a report is completely anonymous, an institution may have no way to verify it came from a legitimate member of its community. But if someone has to reveal their identity to prove they're legitimate, fear of exposure can stop them from reporting in the first place.

We asked:

What if you could prove you're legitimate without revealing who you are?

VEIL is our answer: a privacy-first reporting platform built around one separation — Identity → Eligibility → Report → Verification.

🚀 What It Does

A reporter first verifies they're an eligible member of the institution. After successful verification, VEIL issues a pseudonymous identity used to submit and track a report — never linked back to who they are.

Reporters can:

🔐 Verify eligibility
📝 Submit an incident report
🎭 Remain pseudonymous
📍 Track report status
📨 Receive requests for additional information
💬 Communicate with administrators without revealing their identity

Administrators can:

📥 Receive and review reports
✅ Verify reporter eligibility
🔎 Request additional information
↩️ Respond to reporters
🔄 Update report status
🧾 Maintain a verifiable audit trail

Verified reporter. Protected identity. Accountable report.

🛠️ How We Built It

VEIL is a full-stack, privacy-first application.

Frontend — dedicated reporter and administrator experiences: eligibility verification, report submission, anonymous two-way communication, status tracking, and public verification.
Backend — a Node.js server managing report workflows and audit information while minimizing exposure of sensitive data.
Privacy layer — designed around the Midnight ecosystem, using a Compact smart contract for eligibility verification and tamper-evident audit logging. Sensitive report content is kept off-chain entirely — Midnight is used only where privacy and verifiability are actually needed, never as a database for personal information.
🧩 Challenges
Making Midnight meaningful rather than bolting a blockchain transaction onto a traditional reporting app — deciding what actually needs to be verifiable, what should stay private, and what should never reach the chain at all.
Working with a fast-moving blockchain dev ecosystem, keeping the contract design aligned with current Midnight tooling rather than outdated examples.
Scope discipline on a hackathon timeline: one complete, working workflow over a dozen disconnected features.
🏆 What We're Proud Of
Turned a contradiction — prove you're legitimate without revealing who you are — into one working flow
Built a functional full-stack application, live and deployed
Eligibility verification with pseudonymous reporter identities
Anonymous two-way communication between reporters and administrators
Administrator dashboards, status tracking, and audit/verification views
A Compact smart contract design for the on-chain verification layer
A public verification experience anyone can check without exposing content or identity
📚 What We Learned

Privacy and accountability don't have to be opposites. The interesting question isn't "how do we hide someone's name" — it's "how can a system verify a claim about someone without needing to know everything about them?"

We learned to separate identity from eligibility, eligibility from the report itself, and the report from its public verification state. We also learned blockchain shouldn't mean "put everything on-chain" — the better question for privacy-sensitive applications is: what actually needs to be verifiable? Everything else should stay protected.

🔮 What's Next
Institutional digital credentials
Multiple universities and organizations
Stronger anonymous-credential systems
Encrypted evidence management
Anonymous whistleblower communication
Emergency reporting
Escalation and case-management workflows
Mobile applications
Advanced moderation and analytics
Cross-institution verification

The long-term vision: a privacy-preserving reporting and accountability layer for any organization where people need to speak up without unnecessarily exposing themselves.

VEIL separates the proof from the person.

🌐 Try VEIL

Live Demo: https://veil-zeta-rosy.vercel.app

Local run (no build step, no dependencies beyond Node.js):

bash
node server.js

Then open http://localhost:8787. The server prints an admin token and four demo credentials on startup — use any of them on the Reporter → Verify Eligibility screen.

🛠️ Built With

Node.js · vanilla JavaScript · HTML · CSS · Midnight · Compact · zero-knowledge proofs (design) · blockchain · privacy · cybersecurity · full-stack · web3



📄 License

MIT License

👩‍💻 Developer

Shambhavi GitHub: https://github.com/ShambhaviCode
