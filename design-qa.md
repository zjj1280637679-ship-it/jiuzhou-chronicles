# Mobile theatre design QA

final result: passed

## Comparison target and evidence

- Selected visual truth: `docs/design/mobile-theater-reference.webp`, the second displayed image in the latest corrected ideation set. Narrative decisions/custom action are absent in normal reading.
- Original source:853×1844px, normalized to390×844px. Implementation: `docs/design/mobile-theater-implementation.jpg`,390×844px, CSS viewport390×844, density1, captured in the in-app browser at `http://127.0.0.1:4173/`.
- State: Ming first chapter, 户部尚书 dialogue, normal reading without an open choice or settings sheet.
- Full-view combined comparison: `docs/design/mobile-theater-comparison.webp` (source and implementation in the same image). Opened and reviewed after final fixes. Both phone panels remain full390px width, so body text, speaker and navigation are readable without another enlarged crop.

## Findings and resolved iterations

No actionable P0/P1/P2 remains.

1. Initial reading capture placed the chapter name in a long truncated status string and preserved source-HTML whitespace before the body. Shortened the scene title, separated literal story whitespace from template whitespace, and aligned the scene/reader boundary near47% of screen. Post-fix combined evidence shows the concise title and readable flat reading area.
2. Removing card animation inherited the original opacity0. Added explicit opacity1 to the temporary choice cards and an actual computed-opacity assertion; the final choices screenshots and5-size regression pass.
3. The illustration panel selector did not match `.illustration-box`; horizontal short screens could crop the close control. Corrected selector, fixed header, flexible canvas and scrollable caption. Independent actual-card tests pass at844×390,390×844 and320×568; regression covers every phone viewport.
4. Modal isolation blocked the previous reading action. Added a temporary return-to-reading control and restored Escape/left/Q through the existing previous handler. Returning and reopening choices does not advance a turn or node.
5. Restoring a saved middle paragraph skipped navigation refresh. Added the existing navigation refresh after rendering that saved beat. Actual in-app resume at2/4 now enables previous and publishes the correct public navigation metadata.

## Required fidelity surfaces

- Fonts/typography: existing Chinese serif family/native fallbacks,17px body with1.9 line height, compact serif speaker/title and restrained navigation. Session font adjustment affects the actual text. No new remote font dependency.
- Spacing/layout: scene above, speaker strip, a flexible scrollable reader, fixed reachable navigation below. Normal choices have display:none. Minimum44px primary touch targets; short phones give more height to reading, touch landscape uses two columns.
- Colors/tokens: ink background, ivory body, muted antique gold controls. No new gradients or drawn substitute art. Existing unchanged desktop effects remain outside the phone presentation.
- Image quality/assets: independently generated palace illustration and subtle lower ornament, shipped as local WebP; actual upstream Phosphor icons. No rasterized screenshot UI or fabricated SVG art. New scene artwork preserves the selected palace/official subject and warm/cool lighting.
- Copy/content: actual game text and speaker subline are retained. The real queue is2/4 rather than the illustrative mock2/7; no invented paragraphs are inserted to fill space. Custom action and choices only appear at the story's decision state.

## Interaction evidence and limitations

95Node regressions, four-faction regression, original phone AI/WebWorker browser simulation, and5-size UI regression pass. The latter also verifies same-context390→1440→390 restoration, actual font size, true page count, choice return, editable action cancellation, simulated pending-request cancellation, fixed-header form scrolling, illustration captions and save/continue. Mocked requests do not prove a new live model run; no paid generation was needed for this UI change. In-app browser reading and navigation also inspected; no page exception was observed in the isolated regression contexts.

P3: nameplate geometry is simpler than the decorative mock. Source and implementation use different lengths of real dialogue and an independently generated scene asset; this is an intentional production-content difference. Other factions keep their existing illustration library. Physical mobile keyboards, Safari and real notches remain device-test gaps, not claims of verified hardware behaviour.
