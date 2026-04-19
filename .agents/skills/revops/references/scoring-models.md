# Lead Scoring Models

Detailed scoring templates, example models by business type, and calibration
guidance.

## Explicit Scoring Template (Fit)

### Company Attributes

- **Company size** — 1-10 employees: +5; 11-50: +10; 51-200: +15;
  201-1000: +20; 1000+: +15 (unless enterprise-focused, then +25).
- **Industry** — primary target: +20; secondary target: +10; non-target: 0.
- **Revenue** — under $1M: +5; $1M-$10M: +10; $10M-$100M: +15;
  $100M+: +20.
- **Geography** — primary market: +10; secondary market: +5; non-target
  market: 0.

### Contact Attributes

| Attribute      | Criteria                  | Points |
| -------------- | ------------------------- | ------ |
| **Job title**  | C-suite (CEO, CTO, CMO)   | +25    |
|                | VP level                  | +20    |
|                | Director level            | +15    |
|                | Manager level             | +10    |
|                | Individual contributor    | +5     |
| **Department** | Primary buying department | +15    |
|                | Adjacent department       | +5     |
|                | Unrelated department      | 0      |
| **Seniority**  | Decision maker            | +20    |
|                | Influencer                | +10    |
|                | End user                  | +5     |

### Technology Attributes

| Attribute         | Criteria                           | Points                             |
| ----------------- | ---------------------------------- | ---------------------------------- |
| **Tech stack**    | Uses complementary tool            | +15                                |
|                   | Uses competitor                    | +10 (they understand the category) |
|                   | Uses tool you replace              | +20                                |
| **Tech maturity** | Modern stack (cloud, SaaS-forward) | +10                                |
|                   | Legacy stack                       | +5                                 |

---

## Implicit Scoring Template (Engagement)

### High-Intent Signals

| Signal                    | Points | Decay          |
| ------------------------- | ------ | -------------- |
| **Demo request**          | +30    | None           |
| **Pricing page visit**    | +20    | -5 per week    |
| **Free trial signup**     | +25    | None           |
| **Contact sales form**    | +30    | None           |
| **Case study page (2+)**  | +15    | -5 per 2 weeks |
| **Comparison page visit** | +15    | -5 per week    |
| **ROI calculator used**   | +20    | -5 per 2 weeks |

### Medium-Intent Signals

| Signal                        | Points       | Decay          |
| ----------------------------- | ------------ | -------------- |
| **Webinar registration**      | +10          | -5 per month   |
| **Webinar attendance**        | +15          | -5 per month   |
| **Whitepaper download**       | +10          | -5 per month   |
| **Blog visit (3+ in a week)** | +10          | -5 per 2 weeks |
| **Email click**               | +5 per click | -2 per month   |
| **Email open (3+)**           | +5           | -2 per month   |
| **Social media engagement**   | +5           | -2 per month   |

### Low-Intent Signals

| Signal                    | Points | Decay        |
| ------------------------- | ------ | ------------ |
| **Single blog visit**     | +2     | -2 per month |
| **Newsletter open**       | +2     | -1 per month |
| **Single email open**     | +1     | -1 per month |
| **Visited homepage only** | +1     | -1 per week  |

### Product Usage Signals (PLG)

| Signal                           | Points | Decay                    |
| -------------------------------- | ------ | ------------------------ |
| **Created account**              | +15    | None                     |
| **Completed onboarding**         | +20    | None                     |
| **Used core feature (3+ times)** | +25    | -5 per month inactive    |
| **Invited team member**          | +25    | None                     |
| **Hit usage limit**              | +20    | -10 per month            |
| **Exported data**                | +10    | -5 per month             |
| **Connected integration**        | +15    | None                     |
| **Daily active for 5+ days**     | +20    | -10 per 2 weeks inactive |

---

## Negative Scoring Signals

- **Competitor email domain** (-50) — auto-flag for review.
- **Student email (.edu)** (-30) — may still be valid in some cases.
- **Personal email (gmail, yahoo)** (-10) — less relevant for B2B; adjust
  for SMB.
- **Unsubscribe from emails** (-20) — reduce engagement score.
- **Bounce (hard)** (-50) — remove from scoring.
- **Spam complaint** (-100) — remove from all sequences.
- **Job title: Student / Intern** (-25) — low buying authority.
- **Job title: Consultant** (-10) — may be evaluating for a client.
- **No website visit in 90 days** (-15) — score decay.
- **Invalid phone number** (-10) — data quality signal.
- **Careers page visitor only** (-30) — likely a job seeker.

---

## Example Scoring Models

### Model 1: PLG SaaS (ACV $500-$5K)

#### Weight: 30% fit / 70% engagement (heavily favor product usage)

### Fit criteria:

- Company size 10-500: +15
- Target industry: +10
- Manager+ role: +10
- Uses complementary tool: +10

### Engagement criteria:

- Created free account: +15
- Completed onboarding: +20
- Used core feature 3+ times: +25
- Invited team member: +25
- Hit usage limit: +20
- Pricing page visit: +15

### Negative:

- Personal email: -10
- No login in 14 days: -15
- Competitor domain: -50

**MQL threshold: 60 points**
**Recalibration: Monthly** (fast feedback loop with high volume)

---

### Model 2: Enterprise Sales-Led (ACV $50K+)

Weighting: 60% fit / 40% engagement. Fit is critical at this ACV.

### Fit criteria:

- Company size 500+: +20
- Revenue $50M+: +15
- Target industry: +15
- VP+ title: +20
- Decision maker confirmed: +15
- Uses competitor: +10

### Engagement criteria:

- Demo request: +30
- Multiple stakeholders engaged: +20
- Attended executive webinar: +15
- Downloaded ROI guide: +10
- Visited pricing page 2+: +15

### Negative:

- Company too small (<100): -30
- Individual contributor only: -15
- Competitor domain: -50

**MQL threshold: 75 points**
**Recalibration: Quarterly** (longer sales cycles, smaller sample size)

---

### Model 3: Mid-Market Hybrid (ACV $5K-$25K)

Weighting: 50% fit / 50% engagement. Balanced approach.

### Fit criteria:

- Company size 50-1000: +15
- Target industry: +10
- Manager-VP title: +15
- Target geography: +10
- Uses complementary tool: +10

### Engagement criteria:

- Demo request or trial signup: +25
- Pricing page visit: +15
- Case study download: +10
- Webinar attendance: +10
- Email engagement (3+ clicks): +10
- Blog visits (5+ pages): +10

### Negative:

- Personal email: -10
- No engagement in 30 days: -10
- Competitor domain: -50
- Student/intern title: -25

**MQL threshold: 65 points**
**Recalibration: Quarterly**

---

## Threshold Calibration

### Setting the Initial Threshold

1. **Pull closed-won data** from the last 6-12 months
2. **Retroactively score** each deal using your new model
3. **Find the natural breakpoint** — what score separated wins from losses?
4. **Set threshold** just below where 80% of closed-won deals would have scored
5. **Validate** against closed-lost — if many closed-lost score above threshold,
   tighten criteria

### Calibration Cadence

- **PLG / high volume** — recalibrate monthly. Fast feedback loop, lots
  of data.
- **Mid-market** — recalibrate quarterly. Moderate cycle length.
- **Enterprise** — recalibrate quarterly to semi-annually. Long cycles,
  small sample size.

### Calibration Steps

1. **Pull MQL-to-closed data** for the calibration period
2. **Compare scored MQLs vs. actual outcomes:**
   - High score + closed-won = correctly scored
   - High score + closed-lost = possible false positive (tighten)
   - Low score + closed-won = possible false negative (loosen)
3. **Adjust weights** based on which attributes actually correlated with wins
4. **Adjust threshold** if MQL volume is too high (raise) or too low (lower)
5. **Document changes** and communicate to sales team

### Warning Signs Your Model Needs Recalibration

- MQL-to-SQL acceptance rate drops below 30%
- Sales consistently rejects MQLs as "not ready"
- High-scoring leads don't convert; low-scoring leads do
- MQL volume spikes without corresponding revenue
- New product/market changes since last calibration
