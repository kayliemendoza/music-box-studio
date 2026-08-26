import type { PaperProfile } from '../model/paper'
import type { MechanismProfile } from '../model/mechanism'

/**
 * Printable calibration page: a 100mm measurement box, lane alignment marks at the
 * paper profile's current (editable) values, test holes at the current hole
 * diameter, a feed-direction arrow, a scale warning, and blank space to record
 * measured results from holding this printout against the real blank strip and
 * instruction sheet. Print at 100% and compare/measure before trusting any export.
 */
export function generateCalibrationPageSvg(paper: PaperProfile, profile: MechanismProfile): string {
  const widthMm = 210 // A4/Letter-safe width
  const heightMm = 297
  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}">`)
  parts.push(`<rect x="0" y="0" width="${widthMm}" height="${heightMm}" fill="white"/>`)

  parts.push(`<text x="5" y="10" font-size="6" font-weight="bold" font-family="sans-serif">CALIBRATION PAGE - PRINT AT 100% / ACTUAL SIZE - DO NOT USE "FIT TO PAGE"</text>`)
  parts.push(`<text x="5" y="16" font-size="3.5" font-family="sans-serif">Hold this page against your blank strip and instruction sheet. Measure everything below with a ruler/calipers before trusting any export.</text>`)

  // 100mm measurement box
  parts.push(`<g stroke="#16a34a" fill="none" stroke-width="0.2">`)
  parts.push(`<rect x="5" y="22" width="100" height="10"/>`)
  for (let i = 0; i <= 100; i += 10) {
    parts.push(`<line x1="${5 + i}" y1="22" x2="${5 + i}" y2="${i % 50 === 0 ? 32 : 27}"/>`)
  }
  parts.push('</g>')
  parts.push(`<text x="5" y="37" font-size="3.2" font-family="sans-serif">Measured width of the box above: __________ mm (must read 100mm - if not, your printer is scaling the page)</text>`)

  // Lane alignment marks - one tick per lane at the current profile's spacing
  const laneStartY = 46
  parts.push(`<text x="5" y="${laneStartY - 2}" font-size="3.5" font-family="sans-serif" font-weight="bold">Lane alignment marks (current settings: first lane ${paper.firstLaneOffsetMm}mm from edge, ${paper.laneSpacingMm}mm apart)</text>`)
  parts.push(`<g stroke="#0891b2" stroke-width="0.2">`)
  profile.lanes.forEach((lane) => {
    const y = laneStartY + paper.firstLaneOffsetMm + (lane.lane - 1) * paper.laneSpacingMm
    if (y > 200) return
    parts.push(`<line x1="5" y1="${y}" x2="15" y2="${y}"/>`)
    parts.push(`<text x="16" y="${y + 1}" font-size="2.2" fill="#0891b2" font-family="sans-serif">Lane ${lane.lane} (${lane.soundingNoteName})</text>`)
  })
  parts.push('</g>')
  parts.push(`<text x="80" y="${laneStartY - 2}" font-size="3" font-family="sans-serif">Lay your real strip alongside these marks; adjust "first lane offset" / "lane spacing" in the wizard until they line up exactly, then record here: measured first-lane offset __________ mm, measured lane spacing __________ mm</text>`)

  // Test holes at current diameter
  const testY = 250
  parts.push(`<text x="5" y="${testY - 4}" font-size="3.5" font-family="sans-serif" font-weight="bold">Test holes at current hole diameter (${paper.holeDiameterMm}mm) - punch/cut a test strip and compare against your real mechanism's hooks</text>`)
  parts.push(`<g stroke="#e11d1d" fill="none" stroke-width="0.15">`)
  for (let i = 0; i < 5; i++) {
    parts.push(`<circle cx="${15 + i * 15}" cy="${testY}" r="${paper.holeDiameterMm / 2}"/>`)
  }
  parts.push('</g>')
  parts.push(`<text x="5" y="${testY + 8}" font-size="3" font-family="sans-serif">Measured hole diameter that reliably triggers the mechanism without tearing: __________ mm</text>`)

  // Feed direction arrow + scale warning
  parts.push(`<line x1="150" y1="${testY - 15}" x2="180" y2="${testY - 15}" stroke="#16a34a" stroke-width="0.6"/>`)
  parts.push(`<polygon points="180,${testY - 17} 180,${testY - 13} 184,${testY - 15}" fill="#16a34a"/>`)
  parts.push(`<text x="150" y="${testY - 18}" font-size="2.8" font-family="sans-serif">Feed direction (matches "${paper.feedDirection}")</text>`)

  parts.push(`<rect x="5" y="270" width="200" height="22" fill="none" stroke="#111" stroke-width="0.2"/>`)
  parts.push(`<text x="7" y="275" font-size="3" font-family="sans-serif" font-weight="bold">Recording space - write your measured results here:</text>`)
  parts.push(`<text x="7" y="280" font-size="2.6" font-family="sans-serif">Paper width: _____ mm   Usable length: _____ mm   Leading margin: _____ mm   Ending margin: _____ mm</text>`)
  parts.push(`<text x="7" y="285" font-size="2.6" font-family="sans-serif">Timing-grid spacing: _____ mm   Trigger edge offset: _____ mm   Printer correction: _____ mm   Silhouette offset: _____ mm</text>`)
  parts.push(`<text x="7" y="290" font-size="2.6" font-family="sans-serif">SCALE WARNING: if the 100mm box above does not measure exactly 100mm, STOP and fix printer scaling before calibrating anything else.</text>`)

  parts.push('</svg>')
  return parts.join('\n')
}
