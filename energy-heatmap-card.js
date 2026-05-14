/**
 * Energy Heatmap Card v1.1.0
 * Tarjeta Lovelace para Home Assistant
 * Muestra un mapa de calor de los últimos N días de energía importada/exportada/neta
 *
 * Configuración YAML:
 * type: custom:energy-heatmap-card
 * entity_imported: sensor.energia_importada
 * entity_exported: sensor.energia_exportada
 * entity_net: sensor.energia_neta
 * title: "Mapa de Calor - Energía"
 * mode: net           # imported | exported | net
 * unit: kWh
 * days: 60
 *
 * Changelog:
 * v1.1.0 - Soporte automático de tema oscuro/claro (sigue el tema de HA)
 * v1.0.0 - Versión inicial
 */

const CARD_VERSION = "1.1.1";

// ─── Paletas de color por tema ────────────────────────────────────────────────
const THEMES = {
  dark: {
    cardBg:           "#12121f",
    cardBorder:       "rgba(255,255,255,0.04)",
    primaryText:      "#e2e2f0",
    secondaryText:    "#6b7280",
    statBoxBg:        "rgba(255,255,255,0.04)",
    statBoxBorder:    "rgba(255,255,255,0.06)",
    legendBorder:     "rgba(255,255,255,0.06)",
    refreshBorder:    "rgba(255,255,255,0.12)",
    refreshHoverBg:   "rgba(255,255,255,0.06)",
    tooltipBg:        "rgba(8,8,18,0.97)",
    tooltipBorder:    "rgba(255,255,255,0.15)",
    tooltipText:      "#e2e2f0",
    emptyCellBg:      "#1a1a2e",
    legendNetCenter:  "#1a1a2e",
    cardShadow:       "0 4px 24px rgba(0,0,0,0.4)",
    tooltipShadow:    "0 4px 20px rgba(0,0,0,0.6)",
    cellHoverFilter:  "brightness(1.3)",
  },
  light: {
    cardBg:           "#ffffff",
    cardBorder:       "rgba(0,0,0,0.07)",
    primaryText:      "#111827",
    secondaryText:    "#6b7280",
    statBoxBg:        "rgba(0,0,0,0.03)",
    statBoxBorder:    "rgba(0,0,0,0.07)",
    legendBorder:     "rgba(0,0,0,0.08)",
    refreshBorder:    "rgba(0,0,0,0.15)",
    refreshHoverBg:   "rgba(0,0,0,0.05)",
    tooltipBg:        "rgba(255,255,255,0.98)",
    tooltipBorder:    "rgba(0,0,0,0.14)",
    tooltipText:      "#111827",
    emptyCellBg:      "#ebebf5",
    legendNetCenter:  "#e0e0f0",
    cardShadow:       "0 2px 12px rgba(0,0,0,0.08)",
    tooltipShadow:    "0 4px 16px rgba(0,0,0,0.15)",
    cellHoverFilter:  "brightness(0.82)",
  },
};

class EnergyHeatmapCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._days        = 60;
    this._data        = [];
    this._config      = {};
    this._hass        = null;
    this._initialized = false;
    this._theme       = "dark";
  }

  static getConfigElement() {
    return document.createElement("energy-heatmap-card-editor");
  }

  static getStubConfig() {
    return {
      entity_imported: "sensor.energia_importada",
      entity_exported: "sensor.energia_exportada",
      entity_net:      "sensor.energia_neta",
      title:           "Energía - Últimos 60 días",
      mode:            "net",
      unit:            "kWh",
      days:            60,
    };
  }

  setConfig(config) {
    if (!config.entity_imported && !config.entity_net && !config.entity_exported) {
      throw new Error("Debes configurar al menos entity_imported, entity_exported o entity_net");
    }
    this._config = {
      title: "Energía",
      mode:  "net",
      unit:  "kWh",
      days:  60,
      ...config,
    };
    this._days        = this._config.days || 60;
    this._initialized = false;
  }

  set hass(hass) {
    this._hass = hass;
    const newTheme   = this._detectTheme();
    const themeChanged = newTheme !== this._theme;
    this._theme = newTheme;

    if (!this._initialized) {
      this._initialized = true;
      this._fetchHistory();
    } else if (themeChanged && this._data.length > 0) {
      this._render(this._data);
    }
  }

  // ─── Detectar tema ────────────────────────────────────────────────────────
  // Tres métodos en cascada para máxima compatibilidad con versiones de HA.
  _detectTheme() {
    // 1. API oficial (HA 2021.6+)
    if (this._hass?.themes) {
      if (typeof this._hass.themes.darkMode === "boolean") {
        return this._hass.themes.darkMode ? "dark" : "light";
      }
    }

    // 2. Variable CSS del documento host
    try {
      const bg = getComputedStyle(document.documentElement)
        .getPropertyValue("--primary-background-color").trim();
      if (bg) return this._isColorDark(bg) ? "dark" : "light";
    } catch (_) {}

    // 3. Variable CSS del propio elemento
    try {
      const bg = getComputedStyle(this)
        .getPropertyValue("--primary-background-color").trim();
      if (bg) return this._isColorDark(bg) ? "dark" : "light";
    } catch (_) {}

    return "dark"; // fallback seguro
  }

  // Luminancia relativa (WCAG) vía canvas 1×1
  _isColorDark(color) {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const ctx = c.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
    } catch (_) {
      return true;
    }
  }

  // ─── Historial ────────────────────────────────────────────────────────────
  async _fetchHistory() {
    if (!this._hass) return;

    const end   = new Date();
    const start = new Date();
    start.setDate(start.getDate() - this._days);

    const mode = this._config.mode || "net";
    let entityId;
    if      (mode === "imported") entityId = this._config.entity_imported;
    else if (mode === "exported") entityId = this._config.entity_exported;
    else                          entityId = this._config.entity_net || this._config.entity_imported;

    if (!entityId) {
      this._renderError("No se encontró la entidad para el modo: " + mode);
      return;
    }

    try {
      const history = await this._hass.callApi(
        "GET",
        `history/period/${start.toISOString()}?end_time=${end.toISOString()}&filter_entity_id=${entityId}&minimal_response=true`
      );
      if (!history || !history[0]) { this._data = []; this._render([]); return; }
      this._data = this._processHistory(history[0]);
      this._render(this._data);
    } catch (err) {
      console.error("EnergyHeatmapCard: Error al obtener historial", err);
      this._renderError("Error al obtener historial: " + err.message);
    }
  }

  _processHistory(states) {
    const byDay = {};
    for (const state of states) {
      if (state.state === "unavailable" || state.state === "unknown") continue;
      const val = parseFloat(state.state);
      if (isNaN(val)) continue;
      const dt  = new Date(state.last_changed || state.last_updated);
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
      if (!byDay[key] || val > byDay[key].value) byDay[key] = { value: val };
    }
    const result = [];
    for (let i = this._days - 1; i >= 0; i--) {
      const d   = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      result.push({
        date:       key,
        value:      byDay[key] ? byDay[key].value : null,
        dayOfWeek:  d.getDay(),
        month:      d.getMonth(),
        dayOfMonth: d.getDate(),
      });
    }
    return result;
  }

  // ─── Colores del heatmap ──────────────────────────────────────────────────
  _getColor(value, min, max, mode, theme) {
    const t = THEMES[theme];
    if (value === null) return t.emptyCellBg;
    const ratio = max > min ? (value - min) / (max - min) : 0.5;

    if (mode === "net") {
      if (value < 0) {
        const alpha = 0.25 + Math.abs(ratio) * 0.75;
        return `rgba(22,163,74,${alpha})`;
      }
      const r = Math.round(220 + ratio * 35);
      const g = Math.round(120 - ratio * 100);
      const b = Math.round(40  - ratio * 30);
      const a = theme === "light" ? 0.2 + ratio * 0.8 : 1;
      return `rgba(${r},${g},${b},${a})`;
    }
    if (mode === "exported") {
      return `rgba(22,163,74,${0.15 + ratio * 0.85})`;
    }
    return `rgba(234,88,12,${0.15 + ratio * 0.85})`;
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  _render(data) {
    const mode  = this._config.mode  || "net";
    const unit  = this._config.unit  || "kWh";
    const title = this._config.title || "Energía";
    const theme = this._theme;
    const t     = THEMES[theme];

    const values = data.filter(d => d.value !== null).map(d => d.value);
    const min    = values.length ? Math.min(...values) : 0;
    const max    = values.length ? Math.max(...values) : 1;
    const avg    = values.length ? values.reduce((a,b) => a+b, 0) / values.length : 0;
    const total  = values.reduce((a,b) => a+b, 0);

    const modeLabel = { imported:"Importada", exported:"Exportada", net:"Neta" }[mode] || "Neta";
    const modeColor = { imported:"#ea580c",   exported:"#16a34a",   net:"#3b82f6" }[mode] || "#3b82f6";

    // Grid
    const startOffset = data[0] ? data[0].dayOfWeek : 0;
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push({ empty: true });
    for (const d of data) cells.push({ ...d, empty: false });
    const totalCols = Math.ceil(cells.length / 7);

    let cellsHTML = "";
    for (const cell of cells) {
      if (cell.empty) { cellsHTML += `<div class="hm-cell empty"></div>`; continue; }
      const color = this._getColor(cell.value, min, max, mode, theme);
      cellsHTML += `<div class="hm-cell" style="background:${color}"
        data-value="${cell.value !== null ? cell.value.toFixed(2) : ""}"
        data-date="${cell.date}"></div>`;
    }

    // Leyenda
    let legendStops = "";
    if (mode === "net") {
      legendStops = `
        <div class="legend-bar" style="background:linear-gradient(to right,rgba(22,163,74,0.9),rgba(22,163,74,0.15),${t.legendNetCenter},rgba(234,88,12,0.15),rgba(220,38,38,0.9))"></div>
        <div class="legend-labels"><span>Exportando</span><span>0</span><span>Importando</span></div>`;
    } else if (mode === "exported") {
      legendStops = `
        <div class="legend-bar" style="background:linear-gradient(to right,rgba(22,163,74,0.15),rgba(22,163,74,0.9))"></div>
        <div class="legend-labels"><span>${min.toFixed(1)}</span><span>${max.toFixed(1)} ${unit}</span></div>`;
    } else {
      legendStops = `
        <div class="legend-bar" style="background:linear-gradient(to right,rgba(234,88,12,0.15),rgba(234,88,12,0.9))"></div>
        <div class="legend-labels"><span>${min.toFixed(1)}</span><span>${max.toFixed(1)} ${unit}</span></div>`;
    }

    // Meses
    const monthNames = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    let monthLabels = ""; let lastMonth = -1; let colIdx = 0;
    for (let c = 0; c < cells.length; c += 7) {
      const cell = cells[c];
      if (cell && !cell.empty && cell.month !== lastMonth) {
        lastMonth = cell.month;
        monthLabels += `<span class="month-label" style="grid-column:${colIdx+1}">${monthNames[cell.month]}</span>`;
      }
      colIdx++;
    }

    const dayLabels = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
    const cellMinPx = 14;

    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Syne:wght@400;600;700&display=swap');

        :host {
          display: block;
          font-family: 'Syne', sans-serif;
          color-scheme: ${theme};
        }

        ha-card {
          background: var(--ha-card-background, var(--card-background-color, ${t.cardBg}));
          border: 1px solid ${t.cardBorder};
          border-radius: 16px;
          padding: 20px;
          box-shadow: ${t.cardShadow};
          overflow: hidden;
          position: relative;
        }

        ha-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, ${modeColor}, transparent);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
          gap: 8px;
        }

        .card-title {
          font-size: 1rem;
          font-weight: 700;
          color: var(--primary-text-color, ${t.primaryText});
          letter-spacing: 0.08em;
          text-transform: uppercase;
          line-height: 1.2;
        }

        .mode-badge {
          font-size: 0.65rem;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 20px;
          background: ${modeColor}22;
          color: ${modeColor};
          border: 1px solid ${modeColor}55;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 20px;
        }

        .stat-box {
          background: ${t.statBoxBg};
          border-radius: 10px;
          padding: 10px 12px;
          border: 1px solid ${t.statBoxBorder};
        }

        .stat-label {
          font-size: 0.6rem;
          color: var(--secondary-text-color, ${t.secondaryText});
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 4px;
          font-family: 'JetBrains Mono', monospace;
        }

        .stat-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85rem;
          font-weight: 600;
          color: ${modeColor};
        }

        .heatmap-wrapper { overflow-x: auto; padding-bottom: 4px; }

        .month-row {
          display: grid;
          grid-template-columns: 28px repeat(${totalCols}, 1fr);
          gap: 2px;
          margin-bottom: 4px;
          min-width: ${totalCols * cellMinPx + 30}px;
        }

        .month-label {
          font-size: 0.58rem;
          color: var(--secondary-text-color, ${t.secondaryText});
          font-family: 'JetBrains Mono', monospace;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          align-self: center;
        }

        .heatmap-grid-wrapper {
          display: grid;
          grid-template-columns: 28px repeat(${totalCols}, 1fr);
          gap: 2px;
          min-width: ${totalCols * cellMinPx + 30}px;
        }

        .day-labels {
          display: grid;
          grid-template-rows: repeat(7, 1fr);
          gap: 2px;
        }

        .day-label {
          font-size: 0.55rem;
          color: var(--secondary-text-color, ${t.secondaryText});
          font-family: 'JetBrains Mono', monospace;
          display: flex;
          align-items: center;
          height: 100%;
        }

        .heatmap-grid {
          display: grid;
          grid-template-columns: repeat(${totalCols}, 1fr);
          grid-template-rows: repeat(7, 1fr);
          grid-auto-flow: column;
          gap: 2px;
        }

        .hm-cell {
          width: 100%;
          aspect-ratio: 1;
          min-width: 10px;
          min-height: 10px;
          border-radius: 2px;
          cursor: pointer;
          transition: transform 0.1s, filter 0.1s, box-shadow 0.1s;
        }

        .hm-cell:not(.empty):hover {
          transform: scale(1.6);
          filter: ${t.cellHoverFilter};
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
          z-index: 10;
          position: relative;
        }

        .hm-cell.empty { background: transparent !important; cursor: default; }

        .legend {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid ${t.legendBorder};
        }

        .legend-title {
          font-size: 0.6rem;
          color: var(--secondary-text-color, ${t.secondaryText});
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-family: 'JetBrains Mono', monospace;
          margin-bottom: 6px;
        }

        .legend-bar { height: 6px; border-radius: 3px; width: 100%; margin-bottom: 4px; }

        .legend-labels {
          display: flex;
          justify-content: space-between;
          font-size: 0.6rem;
          color: var(--secondary-text-color, ${t.secondaryText});
          font-family: 'JetBrains Mono', monospace;
        }

        .footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 14px;
        }

        .footer-days {
          font-size: 0.6rem;
          color: var(--secondary-text-color, ${t.secondaryText});
          font-family: 'JetBrains Mono', monospace;
          opacity: 0.7;
        }

        .refresh-btn {
          background: none;
          border: 1px solid ${t.refreshBorder};
          border-radius: 6px;
          color: var(--secondary-text-color, ${t.secondaryText});
          font-size: 0.65rem;
          padding: 3px 8px;
          cursor: pointer;
          font-family: 'JetBrains Mono', monospace;
          transition: all 0.2s;
        }

        .refresh-btn:hover {
          background: ${t.refreshHoverBg};
          color: var(--primary-text-color, ${t.primaryText});
        }

        .tooltip {
          position: fixed;
          background: ${t.tooltipBg};
          border: 1px solid ${t.tooltipBorder};
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 0.72rem;
          font-family: 'JetBrains Mono', monospace;
          color: ${t.tooltipText};
          pointer-events: none;
          z-index: 9999;
          display: none;
          box-shadow: ${t.tooltipShadow};
          line-height: 1.5;
        }

        .no-data {
          text-align: center;
          padding: 30px 0;
          color: var(--secondary-text-color, ${t.secondaryText});
          font-size: 0.8rem;
          font-family: 'JetBrains Mono', monospace;
        }
      </style>

      <ha-card>
        <div class="card-header">
          <div class="card-title">${title}</div>
          <div class="mode-badge">⚡ ${modeLabel}</div>
        </div>

        ${values.length > 0 ? `
        <div class="stats-row">
          <div class="stat-box">
            <div class="stat-label">Promedio/día</div>
            <div class="stat-value">${avg.toFixed(1)} <small style="font-size:.65rem;opacity:.7">${unit}</small></div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Máximo</div>
            <div class="stat-value">${max.toFixed(1)} <small style="font-size:.65rem;opacity:.7">${unit}</small></div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Total ${this._days}d</div>
            <div class="stat-value">${total.toFixed(0)} <small style="font-size:.65rem;opacity:.7">${unit}</small></div>
          </div>
        </div>` : ""}

        <div class="heatmap-wrapper">
          <div class="month-row">
            <div></div>${monthLabels}
          </div>
          <div class="heatmap-grid-wrapper">
            <div class="day-labels">
              ${dayLabels.map((d, i) => `<div class="day-label">${i % 2 === 0 ? d : ""}</div>`).join("")}
            </div>
            <div class="heatmap-grid">${cellsHTML}</div>
          </div>
        </div>

        ${values.length > 0 ? `
        <div class="legend">
          <div class="legend-title">Intensidad</div>
          ${legendStops}
        </div>` : `<div class="no-data">No hay datos históricos disponibles</div>`}

        <div class="footer">
          <div class="footer-days">Últimos ${this._days} días · Reset 12:00</div>
          <button class="refresh-btn" id="refresh-btn">↻ Actualizar</button>
        </div>
      </ha-card>

      <div class="tooltip" id="tooltip"></div>
    `;

    // Tooltip
    const tooltip = this.shadowRoot.getElementById("tooltip");
    this.shadowRoot.querySelectorAll(".hm-cell:not(.empty)").forEach(cell => {
      cell.addEventListener("mouseenter", e => {
        const d = new Date(cell.dataset.date + "T12:00:00");
        const dateStr = d.toLocaleDateString("es-MX", { weekday:"short", year:"numeric", month:"short", day:"numeric" });
        const val = cell.dataset.value;
        tooltip.innerHTML = `<strong>${dateStr}</strong><br>${val ? val + " " + unit : "Sin datos"}`;
        tooltip.style.display = "block";
        tooltip.style.left = e.clientX + 14 + "px";
        tooltip.style.top  = e.clientY - 44 + "px";
      });
      cell.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
      cell.addEventListener("mousemove",  e => {
        tooltip.style.left = e.clientX + 14 + "px";
        tooltip.style.top  = e.clientY - 44 + "px";
      });
    });

    // Refresh
    const btn = this.shadowRoot.getElementById("refresh-btn");
    if (btn) btn.addEventListener("click", () => { this._initialized = false; this._fetchHistory(); });
  }

  _renderError(msg) {
    this.shadowRoot.innerHTML = `
      <ha-card style="padding:20px;color:var(--error-color,#ef4444);font-family:monospace;font-size:.8rem;">
        ⚠️ EnergyHeatmapCard: ${msg}
      </ha-card>`;
  }

  getCardSize() { return 4; }
}

// ─── Editor (base para UI visual de HA) ──────────────────────────────────────
class EnergyHeatmapCardEditor extends HTMLElement {
  setConfig(config) { this._config = config; }
}

customElements.define("energy-heatmap-card-editor", EnergyHeatmapCardEditor);
customElements.define("energy-heatmap-card", EnergyHeatmapCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type:             "energy-heatmap-card",
  name:             "Energy Heatmap Card",
  description:      "Mapa de calor de energía importada/exportada/neta. Tema oscuro/claro automático.",
  preview:          false,
  documentationURL: "https://github.com/tu-usuario/energy-heatmap-card",
});

console.info(
  `%c ENERGY-HEATMAP-CARD %c v${CARD_VERSION} `,
  "background:#1e40af;color:#fff;padding:2px 6px;border-radius:3px 0 0 3px;font-weight:bold",
  "background:#0f172a;color:#60a5fa;padding:2px 6px;border-radius:0 3px 3px 0"
);
