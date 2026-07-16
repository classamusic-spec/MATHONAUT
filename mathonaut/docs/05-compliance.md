# 05 — Compliance, Privacy & Accessibility

Treat this as a build blocker, not paperwork. Getting it wrong means rejection,
removal, or a regulator. This document is guidance, not legal advice — **have a
lawyer review before submission.**

## Who this applies to

An app designed for under-13s in the US falls under **COPPA**. In the EU/UK,
**GDPR-K** and the **UK Age Appropriate Design Code** apply. Apple's **Kids Category**
adds its own rules on top and is reviewed strictly.

## Hard requirements

### Data
- [ ] **No third-party ad SDKs. None.**
- [ ] **No behavioural/tracking analytics on child sessions.** First-party only.
- [ ] **No IDFA / advertising identifiers.**
- [ ] Collect the minimum: a child needs a **display name only**. No email, no
      birthday beyond an age band, no photos, no location, no contacts.
- [ ] **Children never have accounts.** The *parent* holds the account; children are
      profiles under it.
- [ ] Verifiable parental consent before any data leaves the device.
- [ ] Local-first: the game must be fully playable with **zero network**.
- [ ] Data deletion on request; account deletion deletes child data.
- [ ] Child performance data is **never** used for ad targeting or sold. Ever.

### Interface
- [ ] **Parental gate** before: purchases, external links, social sharing, settings,
      the parent dashboard. Gate must not be solvable by the target age — use a
      multi-step or arithmetic-beyond-level challenge (ironic, but standard), not
      "tap and hold" alone.
- [ ] No links out to web/social without a gate.
- [ ] Privacy policy linked from the store listing and in-app.
- [ ] Price and subscription terms disclosed clearly to the parent, behind the gate.
- [ ] Restore purchases available.

### Store
- [ ] Apple Kids Category age band selected (5 and under / 6–8 / 9–11)
- [ ] Apple privacy nutrition labels accurate
- [ ] Google Play **Families** policy + Designed for Families programme
- [ ] Content rating questionnaires (IARC)

---

## Accessibility

### Current blockers — fix before ship

1. **Answer feedback is colour-only.** Correct = green, wrong = red. This fails
   colourblind children entirely. **Add a redundant cue:** a ✓ / ✗ glyph, a shape
   difference, or an animation difference on the answer pills and 3D signs.
2. **No settings screen.** Needs: sound on/off, music on/off, haptics on/off,
   **reduced motion**, and a high-contrast option.

### Also do
- [ ] `prefers-reduced-motion` → disable the launch pan, camera shake, flyby swell,
      and screen-edge rift pulse. Keep the game fully playable.
- [ ] Minimum touch target 44×44pt for every control.
- [ ] Text contrast ≥ 4.5:1. The HUD answer strip already uses a dark plate for this.
- [ ] Don't rely on hearing: every audio cue has a visual partner.
- [ ] Dyslexia-friendly numerals — the current tabular, heavy weight is good; keep it.
- [ ] Screen reader labels on menus (the flight itself is exempt — it's a game canvas).
- [ ] **Photosensitivity:** no full-screen flashes >3Hz. Audit the red damage flash,
      the boss beam fire, and the blast-off burst against WCAG 2.3.1.

---

## Ethical design rules (self-imposed, and they matter)

- **Never shame a wrong answer.** Current voice: "Ship Needs Repairs" + salvage stars.
  Keep it.
- **Support mode adapts down silently.** A struggling child gets help, not a label.
- **No streak guilt.** Freeze tokens exist for a reason.
- **No comparison to other children.**
- **Sessions should end cleanly.** No mechanic punishes stopping. A parent must be
  able to say "last one" without a meltdown — this is a real product requirement and
  a real review driver.

---

## Pre-submission checklist

- [ ] Privacy policy published + linked
- [ ] Parental gate on every gated surface, tested
- [ ] COPPA data audit: enumerate every field collected and justify it
- [ ] No third-party SDK collects anything on a child session (audit the bundle)
- [ ] Offline play verified end-to-end
- [ ] Purchase restore verified
- [ ] Colour-blind pass on answer feedback
- [ ] Reduced-motion pass
- [ ] Photosensitivity/flash audit
- [ ] Age band + nutrition labels accurate
- [ ] Legal review complete
