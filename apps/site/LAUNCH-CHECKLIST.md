# Bookflow — Legal / compliance checklist for app launch

Saved 2026-06-05 from the pre-launch legal review of privacy.html and terms.html.
These are **not blockers for the waitlist site**, but should be resolved (with a
privacy lawyer) **before the app goes live** and starts processing real user data
in the EU, UK, California, and other regulated markets. This is a working
checklist, not legal advice.

## Must do before launch

- [ ] **Legal identity + publishable contact address**
      Decide on a registered entity (or use full personal name) and a publishable
      contact address (service/P.O. address is fine — not a home address).
      → Add to `privacy.html` §1 (Who we are) and `terms.html` §21 (Contact).
      GDPR Art. 13, EU consumer law, and Apple/Google review all expect this.

- [ ] **EU representative (GDPR Art. 27)**
      Appoint an EU rep (third-party services ~€100–300/yr) or get written
      lawyer confirmation that the "occasional, low-risk" exemption applies.
      → Name + EEA address goes in `privacy.html` §1.

- [ ] **UK representative (UK GDPR Art. 27)**
      Same as above for the UK.

- [ ] **Lawyer sign-off on judgment calls in terms.html**
      - §18 Governing law: Nigeria law / Lagos courts + consumer-law carve-out
      - §15 Liability cap (12-months-paid or USD 50)
      - §16 Indemnification clause
      - Age gate: 13+ vs UK Age-Appropriate Design Code duties for 13–17s,
        and EU countries where digital-consent age is up to 16 (already
        disclosed in privacy.html §9, but the product gate needs a decision)

## Verify at launch time

- [ ] Privacy §2/§4 still match reality (sub-processor list: Supabase,
      Anthropic, ElevenLabs, RevenueCat, PostHog, Sentry, Resend, Apple/Google)
- [ ] Deletion timelines in privacy §6/§8 match actual backend behavior
      (currently promised: immediate/7 days verified; backups purged ≤90 days)
- [ ] In-app account deletion works exactly as described (Apple requirement)
- [ ] If website ever adds analytics/trackers → EU cookie-consent banner
      (currently none: only localStorage theme preference, so no banner needed)
- [ ] Footer Instagram / LinkedIn links are still `#` placeholders — set real
      URLs before launch
- [ ] Bump "Last updated" on both legal pages when any of the above lands

## Done (2026-06-05 review)

- [x] Privacy: named data-controller statement (honest, no entity yet)
- [x] Privacy: California CCPA/CPRA section (§7.1) + authorized-agent line
- [x] Privacy: deletion-timing contradiction reconciled (§6 vs §8)
- [x] Privacy: breach-notification commitment (72h, §11)
- [x] Privacy: EU child-age note (up to 16, §9)
- [x] Terms: EU DSA point-of-contact / notice-and-action (§11)
- [x] Terms: Google Play additional terms (§20)
- [x] Waitlist forms (home ×2, About): privacy-policy link at point of capture
