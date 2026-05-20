class SnapEngine {
    static SNAP_THRESHOLD = 8;   // px en coordenadas SVG
    static GUIDE_COLOR    = '#3b82f6';
    static GUIDE_OPACITY  = '0.85';

    constructor(svgElement, mapManager) {
        this.svg = svgElement;
        this.mapManager = mapManager;
        this.enabled = true;
        this.guides = [];
        this._guideGroup = null;
        this._initGuideLayer();
    }

    _initGuideLayer() {
        // Capa SVG exclusiva para guías — encima de zonas, debajo de puestos
        this._guideGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this._guideGroup.setAttribute('id', 'snap-guides');
        this._guideGroup.setAttribute('pointer-events', 'none');
        // Insertar dentro de #map-root, antes del grupo de desks
        const desksGroup = document.getElementById('desks');
        const mapRoot = document.getElementById('map-root');
        const parent = mapRoot || this.svg;
        if (desksGroup && desksGroup.parentNode === parent) {
            parent.insertBefore(this._guideGroup, desksGroup);
        } else {
            parent.appendChild(this._guideGroup);
        }
    }

    // ─── API pública ─────────────────────────────────────────────────────────

    setEnabled(v) { this.enabled = v; if (!v) this.clearGuides(); }

    /**
     * Calcula snap + guías para un elemento que se mueve.
     * @param {number} x        posición candidata X
     * @param {number} y        posición candidata Y
     * @param {number} w        ancho del elemento
     * @param {number} h        alto del elemento
     * @param {number} skipId   id del desk que se está moviendo (excluir de candidatos)
     * @param {object} desks    Map<id, desk> del editorManager
     * @returns {{ x, y }}      posición corregida por snap
     */
    snap(x, y, w, h, skipId, desks) {
        this.clearGuides();
        if (!this.enabled) return { x, y };

        const T = SnapEngine.SNAP_THRESHOLD;
        const DW = w, DH = h;

        // Bordes del elemento candidato
        const cLeft = x, cRight = x + DW, cCX = x + DW / 2;
        const cTop  = y, cBot   = y + DH, cCY = y + DH / 2;

        let snapX = null, snapY = null;
        const guideLines = [];

        // Recopilar candidatos (otros desks)
        for (const [id, desk] of desks) {
            if (id === skipId) continue;
            const dL = desk.x, dR = desk.x + DW, dCX = desk.x + DW / 2;
            const dT = desk.y, dB = desk.y + DH, dCY = desk.y + DH / 2;

            // ── X snapping (bordes + centro) ──
            const xCandidates = [
                { src: cLeft,  tgt: dLeft  = dL,  adj: 0           },
                { src: cLeft,  tgt: dRight = dR,  adj: 0           },
                { src: cRight, tgt: dLeft,         adj: -DW         },
                { src: cRight, tgt: dRight,        adj: -DW         },
                { src: cCX,    tgt: dCX,           adj: -DW/2       },
            ];
            for (const c of xCandidates) {
                if (Math.abs(c.src - c.tgt) <= T) {
                    const candidate = c.tgt + c.adj;
                    if (snapX === null || Math.abs(c.src - c.tgt) < Math.abs(cLeft - (snapX))) {
                        snapX = candidate;
                        guideLines.push({ type: 'v', pos: c.tgt });
                    }
                }
            }

            // ── Y snapping ──
            const yCandidates = [
                { src: cTop,  tgt: dTop = dT,  adj: 0       },
                { src: cTop,  tgt: dBot = dB,  adj: 0       },
                { src: cBot,  tgt: dTop,        adj: -DH     },
                { src: cBot,  tgt: dBot,        adj: -DH     },
                { src: cCY,   tgt: dCY,         adj: -DH/2   },
            ];
            for (const c of yCandidates) {
                if (Math.abs(c.src - c.tgt) <= T) {
                    const candidate = c.tgt + c.adj;
                    if (snapY === null || Math.abs(c.src - c.tgt) < Math.abs(cTop - (snapY))) {
                        snapY = candidate;
                        guideLines.push({ type: 'h', pos: c.tgt });
                    }
                }
            }
        }

        const finalX = snapX !== null ? snapX : x;
        const finalY = snapY !== null ? snapY : y;

        this._drawGuides(guideLines);
        return { x: finalX, y: finalY };
    }

    clearGuides() {
        if (this._guideGroup) this._guideGroup.innerHTML = '';
        this.guides = [];
    }

    // ─── Dibujado de guías ────────────────────────────────────────────────────

    _drawGuides(lines) {
        const svg = this.svg;
        // Dimensiones del viewBox para extender guías de extremo a extremo
        const vb = svg.viewBox?.baseVal;
        const W = vb ? vb.width  : 1200;
        const H = vb ? vb.height : 800;

        // Deduplicar
        const seen = new Set();
        for (const g of lines) {
            const key = `${g.type}:${g.pos}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('stroke', SnapEngine.GUIDE_COLOR);
            line.setAttribute('stroke-width', '1');
            line.setAttribute('opacity', SnapEngine.GUIDE_OPACITY);
            line.setAttribute('stroke-dasharray', '4 3');

            if (g.type === 'v') {
                line.setAttribute('x1', g.pos); line.setAttribute('y1', 0);
                line.setAttribute('x2', g.pos); line.setAttribute('y2', H);
            } else {
                line.setAttribute('x1', 0);  line.setAttribute('y1', g.pos);
                line.setAttribute('x2', W);  line.setAttribute('y2', g.pos);
            }

            this._guideGroup.appendChild(line);
            this.guides.push(line);
        }
    }
}
