<!-- PR template. Delete sections that don't apply. -->

## Summary
<!-- What this PR does and why. One or two sentences. -->

## Change type
- [ ] Bug fix
- [ ] Feature
- [ ] Refactor / cleanup
- [ ] Accessibility (dyslexia / dyscalculia / WCAG)
- [ ] Security
- [ ] Docs / audits
- [ ] Dependency bump
- [ ] Other

## Test plan
- [ ] `npx ng build --configuration development` clean
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run check:readability` — no new grade-9+ prose introduced
- [ ] Manual verification (describe):
- [ ] Keyboard-only walkthrough passes (Ctrl+Shift+A opens accessibility panel)
- [ ] Screen-reader spot-check (if UI prose touched)

## Audit impact
<!-- If this touches security, accessibility, or governance, name the
finding / ADR / audit section that applies. -->

## Breaking changes
- [ ] No breaking changes
- [ ] Breaking change — describe migration:

## Checklist
- [ ] No secrets added
- [ ] No silent downgrades to existing accessibility posture
- [ ] `rel="noopener noreferrer"` on any new `target="_blank"` links
- [ ] No new raw `innerHTML` / `bypassSecurityTrust*` usage
