/**
 * Energy Heatmap Card v1.3.4
 * Lovelace card for Home Assistant
 * Displays a heatmap for the last N days of imported/exported/net energy
 *
 * YAML configuration:
 * type: custom:energy-heatmap-card
 * entity_imported: sensor.energy_imported
 * entity_exported: sensor.energy_exported
 * entity_net: sensor.energy_net
 * title: "Energy Heatmap"
 * mode: net           # imported | exported | net
 * unit: kWh
 * days: 60
 * color_scheme: green/red   # green/red | purple/blue
 *
 * Changelog:
 * v1.3.4 - In net mode, make NET header/bar color follow total sign using the active palette
 * v1.3.3 - In net mode, color Minimum/Maximum/Average/Total values by sign (including unit) based on selected color scheme
 * v1.3.1 - Add full Home Assistant visual editor with all card options (including color scheme)
 * v1.3.0 - Add YAML color schemes: green/red (default) and purple/blue (Home Assistant Energy-like)
 * v1.2.8 - Remove month tags from heatmap header for a cleaner, stable layout
 * v1.2.7 - Stable calendar-based month labels: label on first column whose first day belongs to new month
 * v1.2.6 - Month label data-anchor (reverted)
 * v1.2.5 - Month label majority-column shift (reverted)
 * v1.2.4 - Update stats to 2x2 (Minimum, Maximum, Average/day, Total); show Total with 1 decimal
 * v1.2.3 - Previous release Fix month label alignment 
 * v1.2.0 - Fix month label alignment (offset + day-labels column compensation)
 * v1.1.0 - Automatic light/dark theme support (follows HA theme)
 * v1.0.0 - Initial version
 */

const CARD_VERSION = "1.3.4";

const COLOR_SCHEMES = {
  greenRed: {
    imported: "#dc2626",
    exported: "#16a34a",
    net:      "#3b82f6",
    netPosRgb: [220, 38, 38],
    netNegRgb: [22, 163, 74],
  },
  purpleBlue: {
    // Tones aligned to the Home Assistant Energy visuals.
    imported: "#4a8ebf",
    exported: "#9777d3",
    net:      "#4a8ebf",
    netPosRgb: [74, 142, 191],
    netNegRgb: [151, 119, 211],
  },
};

// ─── Theme color palettes ─────────────────────────────────────────────────────
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
    // Shadow DOM keeps styles isolated from the dashboard theme/CSS.
    this.attachShadow({ mode: "open" });
    // Internal state used across HA lifecycle updates.
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
      entity_imported: "sensor.energy_imported",
      entity_exported: "sensor.energy_exported",
      entity_net:      "sensor.energy_net",
      title:           "Energy - Last 60 Days",
      mode:            "net",
      unit:            "kWh",
      days:            60,
      color_scheme:    "green/red",
    };
  }

  setConfig(config) {
    // At least one source entity is required so the card can render a mode.
    if (!config.entity_imported && !config.entity_net && !config.entity_exported) {
      throw new Error("You must configure at least entity_imported, entity_exported, or entity_net");
    }
    this._config = {
      title: "Energy",
      mode:  "net",
      unit:  "kWh",
      days:  60,
      color_scheme: "green/red",
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
      // First HA update: load history once.
      this._initialized = true;
      this._fetchHistory();
    } else if (themeChanged && this._data.length > 0) {
      // Re-render only when needed to reflect light/dark changes.
      this._render(this._data);
    }
  }

  // ─── Theme detection ───────────────────────────────────────────────────────
  _detectTheme() {
    if (this._hass?.themes) {
      if (typeof this._hass.themes.darkMode === "boolean") {
        return this._hass.themes.darkMode ? "dark" : "light";
      }
    }
    try {
      const bg = getComputedStyle(document.documentElement)
        .getPropertyValue("--primary-background-color").trim();
      if (bg) return this._isColorDark(bg) ? "dark" : "light";
    } catch (_) {}
    try {
      const bg = getComputedStyle(this)
        .getPropertyValue("--primary-background-color").trim();
      if (bg) return this._isColorDark(bg) ? "dark" : "light";
    } catch (_) {}
    return "dark";
  }

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

  // ─── History ───────────────────────────────────────────────────────────────
  /**
   * Requests entity history from Home Assistant for the configured day window.
   * This method only fetches raw history; daily normalization is done in _processHistory.
   */
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
      this._renderError("Entity not found for mode: " + mode);
      return;
    }

    try {
      const history = await this._hass.callApi(
        "GET",
        `history/period/${start.toISOString()}?end_time=${end.toISOString()}&filter_entity_id=${entityId}&minimal_response=true`
      );
      if (!history || !history[0]) { this._data = []; this._render([]); return; }
      this._data = this._processHistory(history[0], mode);
      this._render(this._data);
    } catch (err) {
      console.error("EnergyHeatmapCard: Error fetching history", err);
      this._renderError("Error fetching history: " + err.message);
    }
  }

  /**
   * Converts many state changes per day into one daily value per date.
   * - net: keeps the latest sample of the day
   * - imported/exported: keeps the max sample of the day (monotonic counters)
   */
  _processHistory(states, mode = "net") {
    const byDay = {};
    for (const state of states) {
      if (state.state === "unavailable" || state.state === "unknown") continue;
      const val = parseFloat(state.state);
      if (isNaN(val)) continue;
      const dt  = new Date(state.last_changed || state.last_updated);
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;

      if (!byDay[key]) {
        byDay[key] = { value: val, ts: dt.getTime() };
        continue;
      }

      if (mode === "net") {
        // Net can go up/down, so we keep the latest value seen in that day.
        if (dt.getTime() >= byDay[key].ts) byDay[key] = { value: val, ts: dt.getTime() };
      } else {
        // Imported/Exported are expected to accumulate during the day.
        if (val > byDay[key].value) byDay[key] = { value: val, ts: byDay[key].ts };
      }
    }

    // Build a fixed-length array (exactly this._days) to keep grid dimensions stable.
    const result = [];
    for (let i = this._days - 1; i >= 0; i--) {
      const d   = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      result.push({
        date:       key,
        value:      byDay[key] ? byDay[key].value : null,
        year:       d.getFullYear(),
        dayOfWeek:  d.getDay(),
        month:      d.getMonth(),
        dayOfMonth: d.getDate(),
      });
    }
    return result;
  }

  // ─── Heatmap colors ────────────────────────────────────────────────────────
  _normalizeColorScheme(value) {
    const v = String(value || "green/red").trim().toLowerCase();
    if (v === "purple/blue" || v === "purple_blue" || v === "purple-blue") return "purpleBlue";
    return "greenRed";
  }

  _getSchemeColors() {
    return COLOR_SCHEMES[this._normalizeColorScheme(this._config.color_scheme)];
  }

  _rgbToRgba(rgb, alpha) {
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  }

  _getSignedStatColor(value, mode, scheme, fallbackColor) {
    if (mode !== "net") return fallbackColor;
    return value < 0 ? scheme.exported : scheme.imported;
  }

  _getNetUiColor(total, hasData, scheme) {
    if (!hasData || total === 0) return scheme.net;
    return total < 0 ? scheme.exported : scheme.imported;
  }

  _getColor(value, min, max, mode, theme) {
    const t = THEMES[theme];
    const scheme = this._getSchemeColors();
    if (value === null) return t.emptyCellBg;
    const ratio = max > min ? (value - min) / (max - min) : 0.5;

    if (mode === "net") {
      if (value < 0) {
        const alpha = 0.25 + (1 - ratio) * 0.75;
        return this._rgbToRgba(scheme.netNegRgb, alpha);
      }
      const a = theme === "light" ? 0.2 + ratio * 0.8 : 0.25 + ratio * 0.75;
      return this._rgbToRgba(scheme.netPosRgb, a);
    }
    if (mode === "exported") {
      return this._rgbToRgba(scheme.netNegRgb, 0.15 + ratio * 0.85);
    }
    return this._rgbToRgba(scheme.netPosRgb, 0.15 + ratio * 0.85);
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  /**
   * Builds the full card UI (styles + markup) from normalized daily data.
   * Any change to layout, labels, or interactions is usually done here.
   */
  _render(data) {
    const mode  = this._config.mode  || "net";
    const unit  = this._config.unit  || "kWh";
    const title = this._config.title || "Energy";
    const theme = this._theme;
    const t     = THEMES[theme];
    const scheme = this._getSchemeColors();

    const values = data.filter(d => d.value !== null).map(d => d.value);
    const min    = values.length ? Math.min(...values) : 0;
    const max    = values.length ? Math.max(...values) : 1;
    const avg    = values.length ? values.reduce((a,b) => a+b, 0) / values.length : 0;
    const total  = values.reduce((a,b) => a+b, 0);

    const modeLabel = { imported:"Imported", exported:"Exported", net:"Net" }[mode] || "Net";
    const netUiColor = this._getNetUiColor(total, values.length > 0, scheme);
    const modeColor = { imported: scheme.imported, exported: scheme.exported, net: netUiColor }[mode] || netUiColor;
    const minColor = this._getSignedStatColor(min, mode, scheme, modeColor);
    const maxColor = this._getSignedStatColor(max, mode, scheme, modeColor);
    const avgColor = this._getSignedStatColor(avg, mode, scheme, modeColor);
    const totalColor = this._getSignedStatColor(total, mode, scheme, modeColor);

    // Grid setup:
    // - prepend empty cells so the first day lands in its weekday row
    // - render by columns of 7 cells (Sun..Sat)
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

    // Legend text and gradient are mode-specific.
    let legendStops = "";
    if (mode === "net") {
      legendStops = `
        <div class="legend-bar" style="background:linear-gradient(to right,${this._rgbToRgba(scheme.netNegRgb, 0.9)},${this._rgbToRgba(scheme.netNegRgb, 0.15)},${t.legendNetCenter},${this._rgbToRgba(scheme.netPosRgb, 0.15)},${this._rgbToRgba(scheme.netPosRgb, 0.9)})"></div>
        <div class="legend-labels"><span>Exporting</span><span>0</span><span>Importing</span></div>`;
    } else if (mode === "exported") {
      legendStops = `
        <div class="legend-bar" style="background:linear-gradient(to right,${this._rgbToRgba(scheme.netNegRgb, 0.15)},${this._rgbToRgba(scheme.netNegRgb, 0.9)})"></div>
        <div class="legend-labels"><span>${min.toFixed(1)}</span><span>${max.toFixed(1)} ${unit}</span></div>`;
    } else {
      legendStops = `
        <div class="legend-bar" style="background:linear-gradient(to right,${this._rgbToRgba(scheme.netPosRgb, 0.15)},${this._rgbToRgba(scheme.netPosRgb, 0.9)})"></div>
        <div class="legend-labels"><span>${min.toFixed(1)}</span><span>${max.toFixed(1)} ${unit}</span></div>`;
    }

    const dayLabels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
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
          grid-template-columns: repeat(2, 1fr);
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

        .csv-btn {
          background: none;
          border: 1px solid ${modeColor}55;
          border-radius: 6px;
          color: ${modeColor};
          font-size: 0.65rem;
          padding: 3px 8px;
          cursor: pointer;
          font-family: 'JetBrains Mono', monospace;
          transition: all 0.2s;
        }

        .csv-btn:hover {
          background: ${modeColor}18;
        }

        .footer-btns {
          display: flex;
          gap: 6px;
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
            <div class="stat-label">Minimum</div>
            <div class="stat-value"><span style="color:${minColor}">${min.toFixed(1)}</span> <small style="font-size:.65rem;opacity:.7;color:${minColor}">${unit}</small></div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Maximum</div>
            <div class="stat-value"><span style="color:${maxColor}">${max.toFixed(1)}</span> <small style="font-size:.65rem;opacity:.7;color:${maxColor}">${unit}</small></div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Average/day</div>
            <div class="stat-value"><span style="color:${avgColor}">${avg.toFixed(1)}</span> <small style="font-size:.65rem;opacity:.7;color:${avgColor}">${unit}</small></div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Total ${this._days}d</div>
            <div class="stat-value"><span style="color:${totalColor}">${total.toFixed(1)}</span> <small style="font-size:.65rem;opacity:.7;color:${totalColor}">${unit}</small></div>
          </div>
        </div>` : ""}

        <div class="heatmap-wrapper">
          <div class="heatmap-grid-wrapper">
            <div class="day-labels">
              ${dayLabels.map((d, i) => `<div class="day-label">${i % 2 === 0 ? d : ""}</div>`).join("")}
            </div>
            <div class="heatmap-grid">${cellsHTML}</div>
          </div>
        </div>

        ${values.length > 0 ? `
        <div class="legend">
          <div class="legend-title">Intensity</div>
          ${legendStops}
        </div>` : `<div class="no-data">No historical data available</div>`}

        <div class="footer">
          <div class="footer-days">Last ${this._days} days · Reset 12:00</div>
          <div class="footer-btns">
            <button class="csv-btn" id="csv-btn">⬇ CSV</button>
            <button class="refresh-btn" id="refresh-btn">↻ Refresh</button>
          </div>
        </div>
      </ha-card>

      <div class="tooltip" id="tooltip"></div>
    `;

    // Tooltip binds directly to non-empty cells after the DOM is injected.
    const tooltip = this.shadowRoot.getElementById("tooltip");
    this.shadowRoot.querySelectorAll(".hm-cell:not(.empty)").forEach(cell => {
      cell.addEventListener("mouseenter", e => {
        const d = new Date(cell.dataset.date + "T12:00:00");
        const dateStr = d.toLocaleDateString("en-US", { weekday:"short", year:"numeric", month:"short", day:"numeric" });
        const val = cell.dataset.value;
        tooltip.innerHTML = `<strong>${dateStr}</strong><br>${val ? val + " " + unit : "No data"}`;
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

    // Refresh triggers a new API call and redraw.
    const btn = this.shadowRoot.getElementById("refresh-btn");
    if (btn) btn.addEventListener("click", () => { this._initialized = false; this._fetchHistory(); });

    // CSV export uses the same normalized array currently shown in the card.
    const csvBtn = this.shadowRoot.getElementById("csv-btn");
    if (csvBtn) csvBtn.addEventListener("click", () => this._downloadCSV(data, mode, unit));
  }

  /**
   * Exports visible daily data to CSV (UTF-8 BOM for spreadsheet compatibility).
   */
  _downloadCSV(data, mode, unit) {
    const modeLabel = { imported:"Imported", exported:"Exported", net:"Net" }[mode] || "Net";
    const rows = [
      ["Date", "Day", `Energy ${modeLabel} (${unit})`],
      ...data.map(d => {
        const date = new Date(d.date + "T12:00:00");
        const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
        return [d.date, dayName, d.value !== null ? d.value.toFixed(2) : ""];
      })
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    a.href     = url;
    a.download = `energy-${mode}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Minimal fallback UI shown when API/config problems occur.
  _renderError(msg) {
    this.shadowRoot.innerHTML = `
      <ha-card style="padding:20px;color:var(--error-color,#ef4444);font-family:monospace;font-size:.8rem;">
        ⚠️ EnergyHeatmapCard: ${msg}
      </ha-card>`;
  }

  getCardSize() { return 4; }
}

// ─── Editor (base for HA visual UI) ──────────────────────────────────────────
class EnergyHeatmapCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
  }

  setConfig(config) {
    this._config = {
      title: "Energy",
      mode: "net",
      unit: "kWh",
      days: 60,
      color_scheme: "green/red",
      ...config,
    };
    this._render();
  }

  connectedCallback() {
    if (!this.shadowRoot.innerHTML) this._render();
  }

  _escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  _onValueChanged(ev) {
    const target = ev.target;
    const key = target?.dataset?.config;
    if (!key) return;

    let value = target.value;
    if (key === "days") {
      const parsed = parseInt(value, 10);
      value = Number.isNaN(parsed) ? "" : Math.max(parsed, 1);
      if (target.value !== "" && String(value) !== target.value) target.value = String(value);
    }

    const newConfig = { ...this._config };
    if (value === "") delete newConfig[key];
    else newConfig[key] = value;

    this._config = newConfig;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    }));
  }

  _bindEvents() {
    this.shadowRoot.querySelectorAll("[data-config]").forEach((el) => {
      el.addEventListener("change", (ev) => this._onValueChanged(ev));
      if (el.tagName === "INPUT") {
        el.addEventListener("input", (ev) => this._onValueChanged(ev));
      }
    });
  }

  _render() {
    const cfg = this._config || {};
    const title = this._escapeHtml(cfg.title ?? "Energy");
    const entityImported = this._escapeHtml(cfg.entity_imported ?? "");
    const entityExported = this._escapeHtml(cfg.entity_exported ?? "");
    const entityNet = this._escapeHtml(cfg.entity_net ?? "");
    const mode = String(cfg.mode ?? "net");
    const unit = this._escapeHtml(cfg.unit ?? "kWh");
    const days = this._escapeHtml(cfg.days ?? 60);
    const colorScheme = String(cfg.color_scheme ?? "green/red");

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 8px 0;
          color: var(--primary-text-color);
          font-family: var(--paper-font-body1_-_font-family, sans-serif);
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field.full {
          grid-column: 1 / -1;
        }

        label {
          font-size: 0.78rem;
          color: var(--secondary-text-color);
          letter-spacing: 0.02em;
        }

        input,
        select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color);
          padding: 8px 10px;
          font-size: 0.92rem;
        }

        input:focus,
        select:focus {
          outline: 2px solid var(--primary-color);
          outline-offset: 1px;
        }

        .help {
          margin-top: 10px;
          font-size: 0.76rem;
          color: var(--secondary-text-color);
          line-height: 1.4;
        }
      </style>

      <div class="grid">
        <div class="field full">
          <label for="title">Title</label>
          <input id="title" data-config="title" type="text" value="${title}" placeholder="Energy" />
        </div>

        <div class="field">
          <label for="entity_imported">Imported entity</label>
          <input id="entity_imported" data-config="entity_imported" type="text" value="${entityImported}" placeholder="sensor.energy_imported" />
        </div>

        <div class="field">
          <label for="entity_exported">Exported entity</label>
          <input id="entity_exported" data-config="entity_exported" type="text" value="${entityExported}" placeholder="sensor.energy_exported" />
        </div>

        <div class="field full">
          <label for="entity_net">Net entity</label>
          <input id="entity_net" data-config="entity_net" type="text" value="${entityNet}" placeholder="sensor.energy_net" />
        </div>

        <div class="field">
          <label for="mode">Mode</label>
          <select id="mode" data-config="mode">
            <option value="net" ${mode === "net" ? "selected" : ""}>Net</option>
            <option value="imported" ${mode === "imported" ? "selected" : ""}>Imported</option>
            <option value="exported" ${mode === "exported" ? "selected" : ""}>Exported</option>
          </select>
        </div>

        <div class="field">
          <label for="color_scheme">Color scheme</label>
          <select id="color_scheme" data-config="color_scheme">
            <option value="green/red" ${colorScheme === "green/red" ? "selected" : ""}>Green / Red</option>
            <option value="purple/blue" ${colorScheme === "purple/blue" ? "selected" : ""}>Purple / Blue (Energy)</option>
          </select>
        </div>

        <div class="field">
          <label for="unit">Unit</label>
          <input id="unit" data-config="unit" type="text" value="${unit}" placeholder="kWh" />
        </div>

        <div class="field">
          <label for="days">Days</label>
          <input id="days" data-config="days" type="number" min="1" step="1" value="${days}" placeholder="60" />
        </div>
      </div>

      <div class="help">At least one entity is required: Imported, Exported, or Net.</div>
    `;

    this._bindEvents();
  }
}

customElements.define("energy-heatmap-card-editor", EnergyHeatmapCardEditor);
customElements.define("energy-heatmap-card", EnergyHeatmapCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type:             "energy-heatmap-card",
  name:             "Energy Heatmap Card",
  description:      "Heatmap for imported/exported/net energy. Automatic light/dark theme support.",
  preview:          false,
  documentationURL: "https://github.com/your-username/energy-heatmap-card",
});

console.info(
  `%c ENERGY-HEATMAP-CARD %c v${CARD_VERSION} `,
  "background:#1e40af;color:#fff;padding:2px 6px;border-radius:3px 0 0 3px;font-weight:bold",
  "background:#0f172a;color:#60a5fa;padding:2px 6px;border-radius:0 3px 3px 0"
);
