/** Shared Silhouette layer definitions used by both the DXF and SVG exporters. */
export const SILHOUETTE_LAYERS = {
  CUT_HOLES: { name: 'CUT_HOLES', colorIndex: 1, cssColor: '#e11d1d' }, // red - actual cut geometry
  CUT_OUTLINE: { name: 'CUT_OUTLINE', colorIndex: 1, cssColor: '#e11d1d' }, // red - only when outline cut is explicitly approved
  PRINT_GUIDES: { name: 'PRINT_GUIDES', colorIndex: 4, cssColor: '#0891b2' }, // cyan - lane/measure lines, never cut
  REGISTRATION_MARKS: { name: 'REGISTRATION_MARKS', colorIndex: 3, cssColor: '#16a34a' }, // green - alignment marks, never cut
  NO_CUT_LABELS: { name: 'NO_CUT_LABELS', colorIndex: 7, cssColor: '#111111' }, // black - text, never cut
} as const

export type SilhouetteLayerKey = keyof typeof SILHOUETTE_LAYERS
