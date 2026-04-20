# SLSA L1 → L2 Promotion — retirement-dashboard-angular

| Field | Value |
|---|---|
| **Date** | 2026-04-20 |
| **Branch** | main |
| **Supersedes** | `supply-chain-audit-2026-04-20-post-upgrade.md` SLSA target row |

## What changed

Added a `provenance` job to `.github/workflows/ci.yml` that runs on every
`main`-branch push. The job:

1. Compiles the production Angular bundle (`npx ng build --configuration
   production`).
2. Calls `actions/attest-build-provenance@v2.4.0` to produce an in-toto
   statement signed via Sigstore + GitHub OIDC, covering every output in
   `dist/retirement-dashboard/**/*.{js,css,html,map}`.
3. The signed attestation is stored in GitHub's public attestation
   store and becomes queryable per artefact digest:
   ```
   gh attestation verify <artifact> \
     --repo justice8096/retirement-dashboard-angular
   ```

## Permissions

Grant scoped to the provenance job only:
- `id-token: write` — required for Sigstore OIDC signing
- `attestations: write` — required to publish the claim to GitHub

Pull-request runs **do not** get these permissions (the job is gated
with `if: github.event_name == 'push' && github.ref ==
'refs/heads/main'`), which blocks fork-PR exfiltration of signing
tokens.

## SLSA L2 requirements satisfied

| Requirement | Evidence |
|---|---|
| Build-service generated provenance | `actions/attest-build-provenance` via Sigstore + GitHub OIDC |
| Source is version-controlled | GitHub — already satisfied at L1 |
| Build-as-code | `.github/workflows/ci.yml` — already satisfied at L1 |
| Hosted build platform | GitHub-hosted `ubuntu-latest` runner |
| Signed, authenticated provenance | Sigstore certificate chain verifiable via `gh attestation verify` |
| Retention of provenance | GitHub's attestation store (no expiry on public repos) |

## SLSA L3 path (future)

L3 requires:
- A hardened build platform that prevents builds from influencing each
  other (GitHub hosted runners don't formally meet this; need one of
  the SLSA-conformant reusable workflows from `slsa-github-generator`).
- Non-falsifiable provenance — what we have now is already
  non-falsifiable if attestations are verified before deploy. A deploy
  step that calls `gh attestation verify` before publishing closes
  this.

Not pursuing L3 this cycle — deferred behind a clearer CI/CD deploy
pipeline.

## Open governance gaps (unchanged from post-upgrade audit)

- Commit signing not enforced via branch protection (separate concern
  from SLSA L2; tracked for next GitHub-setup review)
