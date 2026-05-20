class LayoutGenerators {
    static DW = 60;
    static DH = 36;

    constructor(zoneManager) {
        this.zoneManager = zoneManager;
        this.generators = {
            grid:        this.generateGridLayout.bind(this),
            callcenter:  this.generateCallCenterLayout.bind(this),
            classroom:   this.generateClassroomLayout.bind(this),
            rows:        this.generateRowsLayout.bind(this),
            columns:     this.generateColumnsLayout.bind(this),
            island:      this.generateIslandLayout.bind(this),
            circle:      this.generateCircleLayout.bind(this),
            openoffice:  this.generateOpenOfficeLayout.bind(this),
            conference:  this.generateConferenceLayout.bind(this),
        };
    }

    generate(layoutType, zone, config) {
        const gen = this.generators[layoutType] || this.generators.grid;
        return gen(zone, config);
    }

    // ─── Layouts ─────────────────────────────────────────────────────────────

    generateGridLayout(zone, config) {
        const { DW, DH } = LayoutGenerators;
        const rows    = config.rows    || 5;
        const cols    = config.columns || 4;
        const spH     = config.spacingH !== undefined ? config.spacingH : 10;
        const spV     = config.spacingV !== undefined ? config.spacingV : 10;
        const padding = config.padding || 20;
        const positions = [];

        const totalW = (DW + spH) * cols - spH;
        const totalH = (DH + spV) * rows - spV;
        const startX = (zone.width  - totalW) / 2;
        const startY = (zone.height - totalH) / 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = startX + c * (DW + spH);
                const y = startY + r * (DH + spV);
                if (x >= padding && y >= padding &&
                    x + DW <= zone.width  - padding &&
                    y + DH <= zone.height - padding) {
                    positions.push({ x, y, rotation: 0 });
                }
            }
        }
        return positions;
    }

    generateCallCenterLayout(zone, config) {
        // Filas enfrentadas separadas por pasillo central
        const { DW, DH } = LayoutGenerators;
        const rows    = config.rows    || 3;
        const cols    = config.columns || 6;
        const spH     = config.spacingH !== undefined ? config.spacingH : 8;
        const spV     = config.spacingV !== undefined ? config.spacingV : 8;
        const aisle   = config.aisle   || 40;
        const padding = config.padding || 20;
        const positions = [];

        const blockH  = rows * (DH + spV) - spV;
        const blockTY = (zone.height - blockH * 2 - aisle) / 2;

        for (let side = 0; side < 2; side++) {
            const blockY = blockTY + side * (blockH + aisle);
            const rotation = side === 0 ? 0 : 180;

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const totalW = cols * (DW + spH) - spH;
                    const startX = (zone.width - totalW) / 2;
                    const x = startX + c * (DW + spH);
                    const y = blockY + r * (DH + spV);
                    if (x >= padding && y >= padding &&
                        x + DW <= zone.width  - padding &&
                        y + DH <= zone.height - padding) {
                        positions.push({ x, y, rotation });
                    }
                }
            }
        }
        return positions;
    }

    generateClassroomLayout(zone, config) {
        // Filas orientadas hacia el frente (parte superior)
        const { DW, DH } = LayoutGenerators;
        const rows    = config.rows    || 5;
        const cols    = config.columns || 5;
        const spH     = config.spacingH !== undefined ? config.spacingH : 15;
        const spV     = config.spacingV !== undefined ? config.spacingV : 25;
        const padding = config.padding || 30;
        const positions = [];

        const totalW = cols * (DW + spH) - spH;
        const startX = (zone.width - totalW) / 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = startX + c * (DW + spH);
                const y = padding + 40 + r * (DH + spV); // +40 espacio para pizarrón
                if (x + DW <= zone.width - padding && y + DH <= zone.height - padding) {
                    positions.push({ x, y, rotation: 0 });
                }
            }
        }
        return positions;
    }

    generateRowsLayout(zone, config) {
        const { DW, DH } = LayoutGenerators;
        const rows    = config.rows    || 6;
        const spH     = config.spacingH !== undefined ? config.spacingH : 10;
        const spV     = config.spacingV !== undefined ? config.spacingV : 15;
        const padding = config.padding || 20;
        const positions = [];

        const cols = Math.floor((zone.width - padding * 2 + spH) / (DW + spH));
        const totalH = rows * (DH + spV) - spV;
        const startY = (zone.height - totalH) / 2;
        const totalW = cols * (DW + spH) - spH;
        const startX = (zone.width - totalW) / 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = startX + c * (DW + spH);
                const y = startY + r * (DH + spV);
                if (y + DH <= zone.height - padding) {
                    positions.push({ x, y, rotation: 0 });
                }
            }
        }
        return positions;
    }

    generateColumnsLayout(zone, config) {
        const { DW, DH } = LayoutGenerators;
        const cols    = config.columns || 6;
        const spH     = config.spacingH !== undefined ? config.spacingH : 15;
        const spV     = config.spacingV !== undefined ? config.spacingV : 10;
        const padding = config.padding || 20;
        const positions = [];

        const rows = Math.floor((zone.height - padding * 2 + spV) / (DH + spV));
        const totalW = cols * (DW + spH) - spH;
        const startX = (zone.width - totalW) / 2;
        const totalH = rows * (DH + spV) - spV;
        const startY = (zone.height - totalH) / 2;

        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                const x = startX + c * (DW + spH);
                const y = startY + r * (DH + spV);
                if (x + DW <= zone.width - padding) {
                    positions.push({ x, y, rotation: 0 });
                }
            }
        }
        return positions;
    }

    generateIslandLayout(zone, config) {
        const { DW, DH } = LayoutGenerators;
        const groups       = config.groups       || 4;
        const desksPerGrp  = config.desksPerGroup || 4;
        const spH          = config.spacingH !== undefined ? config.spacingH : 8;
        const spV          = config.spacingV !== undefined ? config.spacingV : 8;
        const islandGap    = config.islandGap    || 35;
        const padding      = config.padding      || 25;
        const positions    = [];

        const islandW = DW * 2 + spH;
        const islandH = DH * 2 + spV;
        const islandsPerRow = Math.max(1, Math.floor((zone.width - padding * 2 + islandGap) / (islandW + islandGap)));
        const rows = Math.ceil(groups / islandsPerRow);
        const totalW = islandsPerRow * (islandW + islandGap) - islandGap;
        const totalH = rows * (islandH + islandGap) - islandGap;
        const startX = (zone.width  - totalW) / 2;
        const startY = (zone.height - totalH) / 2;

        for (let g = 0; g < groups; g++) {
            const gr = Math.floor(g / islandsPerRow);
            const gc = g % islandsPerRow;
            const ox = startX + gc * (islandW + islandGap);
            const oy = startY + gr * (islandH + islandGap);
            const offsets = [
                { x: 0,      y: 0      },
                { x: DW + spH, y: 0    },
                { x: 0,      y: DH + spV },
                { x: DW + spH, y: DH + spV },
            ];
            offsets.slice(0, Math.min(desksPerGrp, 4)).forEach(off => {
                positions.push({ x: ox + off.x, y: oy + off.y, rotation: 0 });
            });
        }
        return positions;
    }

    generateCircleLayout(zone, config) {
        const { DW, DH } = LayoutGenerators;
        const total   = config.totalDesks || 12;
        const radius  = config.radius || Math.min(zone.width, zone.height) * 0.35;
        const facing  = config.facing !== false; // puestos apuntando al centro
        const cx = zone.width  / 2;
        const cy = zone.height / 2;
        const positions = [];

        for (let i = 0; i < total; i++) {
            const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
            const x = cx + Math.cos(angle) * radius - DW / 2;
            const y = cy + Math.sin(angle) * radius - DH / 2;
            const rotation = facing ? Math.round((angle * 180 / Math.PI) + 90) : 0;
            positions.push({ x, y, rotation });
        }
        return positions;
    }

    generateOpenOfficeLayout(zone, config) {
        // Clusters de 3 en L rotados aleatoriamente
        const { DW, DH } = LayoutGenerators;
        const spH     = config.spacingH !== undefined ? config.spacingH : 5;
        const spV     = config.spacingV !== undefined ? config.spacingV : 5;
        const padding = config.padding || 20;
        const positions = [];

        const clusterW = DW * 2 + spH;
        const clusterH = DH + spV + DH;
        const cPerRow = Math.max(1, Math.floor((zone.width - padding * 2) / (clusterW + 20)));
        const cPerCol = Math.max(1, Math.floor((zone.height - padding * 2) / (clusterH + 20)));
        const totalClusters = cPerRow * cPerCol;
        const stepX = (zone.width  - padding * 2) / cPerRow;
        const stepY = (zone.height - padding * 2) / cPerCol;

        for (let ci = 0; ci < cPerCol; ci++) {
            for (let cj = 0; cj < cPerRow; cj++) {
                const ox = padding + cj * stepX;
                const oy = padding + ci * stepY;
                // L-shape: 2 arriba, 1 abajo-izquierda
                positions.push({ x: ox,           y: oy,           rotation: 0 });
                positions.push({ x: ox + DW + spH, y: oy,           rotation: 0 });
                positions.push({ x: ox,           y: oy + DH + spV, rotation: 180 });
            }
        }
        return positions;
    }

    generateConferenceLayout(zone, config) {
        // Puestos alrededor de mesa central
        const { DW, DH } = LayoutGenerators;
        const tableMargin = config.tableMargin || 30;
        const padding     = config.padding     || 20;
        const positions   = [];

        const innerW = zone.width  - padding * 2;
        const innerH = zone.height - padding * 2;

        // Top row
        const cols = Math.floor((innerW + 8) / (DW + 8));
        const spH  = (innerW - cols * DW) / Math.max(1, cols - 1);
        for (let c = 0; c < cols; c++) {
            positions.push({ x: padding + c * (DW + spH), y: padding, rotation: 0 });
        }
        // Bottom row
        for (let c = 0; c < cols; c++) {
            positions.push({ x: padding + c * (DW + spH), y: padding + innerH - DH, rotation: 180 });
        }
        // Left column (sin esquinas)
        const rows = Math.max(0, Math.floor((innerH - DH * 2 - 8) / (DH + 8)));
        const spV  = rows > 1 ? (innerH - DH * 2 - rows * DH) / (rows - 1) : 0;
        for (let r = 0; r < rows; r++) {
            positions.push({ x: padding, y: padding + DH + 8 + r * (DH + spV), rotation: 270 });
        }
        // Right column
        for (let r = 0; r < rows; r++) {
            positions.push({ x: padding + innerW - DW, y: padding + DH + 8 + r * (DH + spV), rotation: 90 });
        }
        return positions;
    }

    // ─── Panel de configuración visual con preview ────────────────────────────

    showLayoutPanel(zone, editorManager) {
        const existing = document.getElementById('layout-panel-overlay');
        if (existing) existing.remove();

        const layouts = [
            { id: 'grid',       icon: '⊞', label: 'Grid' },
            { id: 'callcenter', icon: '🎧', label: 'Call Center' },
            { id: 'classroom',  icon: '🎓', label: 'Classroom' },
            { id: 'rows',       icon: '≡',  label: 'Filas' },
            { id: 'columns',    icon: '⫰',  label: 'Columnas' },
            { id: 'island',     icon: '◫',  label: 'Islands' },
            { id: 'circle',     icon: '○',  label: 'Circular' },
            { id: 'openoffice', icon: '🏢', label: 'Open Office' },
            { id: 'conference', icon: '🤝', label: 'Conference' },
        ];

        const overlay = document.createElement('div');
        overlay.id = 'layout-panel-overlay';
        overlay.className = 'layout-panel-overlay';
        overlay.innerHTML = `
            <div class="layout-panel">
                <div class="layout-panel-header">
                    <span>⚡ Auto Layout — Zona: ${zone.name}</span>
                    <button id="layout-panel-close">✕</button>
                </div>
                <div class="layout-panel-body">
                    <div class="layout-types">
                        ${layouts.map(l => `
                            <button class="layout-type-btn" data-layout="${l.id}">
                                <span class="layout-icon">${l.icon}</span>
                                <span>${l.label}</span>
                            </button>
                        `).join('')}
                    </div>
                    <div class="layout-config">
                        <div class="layout-preview-wrap">
                            <canvas id="layout-preview-canvas" width="240" height="160"></canvas>
                        </div>
                        <div class="layout-controls">
                            <div class="form-group">
                                <label>Filas <span id="lc-rows-val">4</span></label>
                                <input type="range" id="lc-rows" min="1" max="12" value="4">
                            </div>
                            <div class="form-group">
                                <label>Columnas <span id="lc-cols-val">4</span></label>
                                <input type="range" id="lc-cols" min="1" max="16" value="4">
                            </div>
                            <div class="form-group">
                                <label>Espacio H <span id="lc-sph-val">10</span>px</label>
                                <input type="range" id="lc-sph" min="0" max="60" value="10">
                            </div>
                            <div class="form-group">
                                <label>Espacio V <span id="lc-spv-val">10</span>px</label>
                                <input type="range" id="lc-spv" min="0" max="60" value="10">
                            </div>
                            <div class="form-group">
                                <label>Padding <span id="lc-pad-val">20</span>px</label>
                                <input type="range" id="lc-pad" min="5" max="80" value="20">
                            </div>
                            <div class="layout-info" id="layout-info">0 puestos</div>
                        </div>
                    </div>
                </div>
                <div class="layout-panel-footer">
                    <button id="layout-cancel" class="btn-secondary">Cancelar</button>
                    <button id="layout-apply" class="btn-primary">Aplicar Layout</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        let selectedLayout = 'grid';
        const canvas  = document.getElementById('layout-preview-canvas');
        const ctx     = canvas.getContext('2d');

        const getConfig = () => ({
            rows:       parseInt(document.getElementById('lc-rows').value),
            columns:    parseInt(document.getElementById('lc-cols').value),
            spacingH:   parseInt(document.getElementById('lc-sph').value),
            spacingV:   parseInt(document.getElementById('lc-spv').value),
            padding:    parseInt(document.getElementById('lc-pad').value),
            totalDesks: parseInt(document.getElementById('lc-rows').value) * parseInt(document.getElementById('lc-cols').value),
            groups:     parseInt(document.getElementById('lc-rows').value),
        });

        const renderPreview = () => {
            const config = getConfig();
            const positions = this.generate(selectedLayout, zone, config);
            const scaleX = canvas.width  / zone.width;
            const scaleY = canvas.height / zone.height;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(10,14,39,0.9)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Borde zona
            ctx.strokeStyle = zone.color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

            // Puestos preview
            const DW = LayoutGenerators.DW * scaleX;
            const DH = LayoutGenerators.DH * scaleY;
            positions.forEach(p => {
                ctx.fillStyle = zone.color + 'cc';
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(p.x * scaleX, p.y * scaleY, DW, DH, 2);
                else ctx.rect(p.x * scaleX, p.y * scaleY, DW, DH);
                ctx.fill();
            });

            document.getElementById('layout-info').textContent =
                `${positions.length} puestos · máx ${zone.capacity}`;
            document.getElementById('layout-info').style.color =
                positions.length > zone.capacity ? '#ef4444' : '#10b981';
        };

        // Sincronizar labels de sliders
        ['rows','cols','sph','spv','pad'].forEach(id => {
            const input = document.getElementById(`lc-${id}`);
            const label = document.getElementById(`lc-${id}-val`);
            input?.addEventListener('input', () => { label.textContent = input.value; renderPreview(); });
        });

        // Botones de layout
        overlay.querySelectorAll('.layout-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                overlay.querySelectorAll('.layout-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedLayout = btn.dataset.layout;
                renderPreview();
            });
        });
        overlay.querySelector('[data-layout="grid"]')?.classList.add('active');

        document.getElementById('layout-panel-close')?.addEventListener('click', () => overlay.remove());
        document.getElementById('layout-cancel')?.addEventListener('click', () => overlay.remove());

        document.getElementById('layout-apply')?.addEventListener('click', () => {
            const config   = getConfig();
            const positions = this.generate(selectedLayout, zone, config);
            const zm = this.zoneManager;
            if (!zm) return;

            // Eliminar puestos existentes de la zona
            zone.desks.forEach(id => editorManager.deleteDesk(id));
            zone.desks = [];

            const limit = Math.min(positions.length, zone.capacity);
            for (let i = 0; i < limit; i++) {
                const p = positions[i];
                const newDesk = {
                    id: editorManager.nextDeskId++,
                    x: zone.x + p.x,
                    y: zone.y + p.y,
                    rotation: p.rotation || 0,
                    status: 'offline',
                    agent: `Agente ${zone.desks.length + 1}`,
                    extension: `${3000 + editorManager.nextDeskId}`,
                    campaign: zone.campaign,
                    zoneId: zone.id,
                    lastUpdate: new Date()
                };
                editorManager.desks.set(newDesk.id, newDesk);
                zm.mapManager?.addDesk(newDesk, null);
                zone.desks.push(newDesk.id);
            }

            zm.refreshZoneLabel(zone);
            editorManager.saveLayout();
            overlay.remove();
        });

        renderPreview();
    }
}
