/**
 * Minimal ASCII DXF (R12 / AC1009) writer. R12 is the most broadly compatible DXF
 * version for CAD/cutter software (including Silhouette Studio's DXF importer),
 * and its named LAYER table is what actually separates cut vs. non-cut geometry
 * reliably - unlike SVG grouping, which different tools interpret inconsistently.
 * All coordinates are written in millimeters (see README for import unit notes).
 */

export interface DxfLayer {
  name: string
  colorIndex: number // AutoCAD Color Index (ACI): 1=red 2=yellow 3=green 4=cyan 5=blue 7=white/black
}

interface Entity {
  toDxf(): string[]
}

class Circle implements Entity {
  constructor(private layer: string, private x: number, private y: number, private radius: number) {}
  toDxf(): string[] {
    return ['0', 'CIRCLE', '8', this.layer, '10', fmt(this.x), '20', fmt(this.y), '30', '0.0', '40', fmt(this.radius)]
  }
}

class Line implements Entity {
  constructor(private layer: string, private x1: number, private y1: number, private x2: number, private y2: number) {}
  toDxf(): string[] {
    return [
      '0', 'LINE', '8', this.layer,
      '10', fmt(this.x1), '20', fmt(this.y1), '30', '0.0',
      '11', fmt(this.x2), '21', fmt(this.y2), '31', '0.0',
    ]
  }
}

class TextEntity implements Entity {
  constructor(private layer: string, private x: number, private y: number, private heightMm: number, private text: string) {}
  toDxf(): string[] {
    return ['0', 'TEXT', '8', this.layer, '10', fmt(this.x), '20', fmt(this.y), '30', '0.0', '40', fmt(this.heightMm), '1', this.text]
  }
}

function fmt(n: number): string {
  return n.toFixed(4)
}

export class DxfDocument {
  private layers: DxfLayer[] = []
  private entities: Entity[] = []

  addLayer(layer: DxfLayer): void {
    this.layers.push(layer)
  }

  addCircle(layer: string, xMm: number, yMm: number, radiusMm: number): void {
    this.entities.push(new Circle(layer, xMm, yMm, radiusMm))
  }

  addLine(layer: string, x1: number, y1: number, x2: number, y2: number): void {
    this.entities.push(new Line(layer, x1, y1, x2, y2))
  }

  addRectOutline(layer: string, x: number, y: number, width: number, height: number): void {
    this.addLine(layer, x, y, x + width, y)
    this.addLine(layer, x + width, y, x + width, y + height)
    this.addLine(layer, x + width, y + height, x, y + height)
    this.addLine(layer, x, y + height, x, y)
  }

  addText(layer: string, xMm: number, yMm: number, heightMm: number, text: string): void {
    this.entities.push(new TextEntity(layer, xMm, yMm, heightMm, text))
  }

  toDxfString(): string {
    const lines: string[] = []
    lines.push('0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC')

    lines.push('0', 'SECTION', '2', 'TABLES')
    lines.push('0', 'TABLE', '2', 'LAYER', '70', String(this.layers.length))
    for (const l of this.layers) {
      lines.push('0', 'LAYER', '2', l.name, '70', '0', '62', String(l.colorIndex), '6', 'CONTINUOUS')
    }
    lines.push('0', 'ENDTAB', '0', 'ENDSEC')

    lines.push('0', 'SECTION', '2', 'ENTITIES')
    for (const e of this.entities) lines.push(...e.toDxf())
    lines.push('0', 'ENDSEC')

    lines.push('0', 'EOF')
    return lines.join('\n')
  }
}
