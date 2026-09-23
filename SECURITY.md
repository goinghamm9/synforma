# Security

Report a vulnerability privately through GitHub: **Security → Report a vulnerability** on this repository.
Do not open a public issue for it, and never include a key, a token or someone's data in a report.

You will get an acknowledgement, a severity assessment, and a fix or a mitigation on `main`; releases
carry the fix as a new version. The `main` branch is the supported version.

What is in place today: CodeQL on every pull request and weekly, Dependabot for npm, GitHub Actions,
Docker and Python dependencies, secret scanning with push protection, a signed build provenance
attestation on every published image, and an OpenSSF Scorecard run each week. Model and decision keys
are read on the server at request time only; the browser never receives them (`docs/OPERATIONS.md`,
"Threat model").
