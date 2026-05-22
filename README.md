# Energy Heatmap Card

Custom Home Assistant (Lovelace) card that shows an **energy heatmap** for the last N days.

Built for daily energy sensors, including setups that reset at 12:00.

---

## Features

- Three display modes: `net`, `imported`, `exported`
- Daily aggregation by mode:
  - `imported` and `exported`: daily **maximum** value
  - `net`: daily **last state** value (end-of-day balance)
- Auto light/dark theme support (follows Home Assistant theme)
- Hover tooltip with exact date and value
- Summary stats: average/day, maximum, total for selected range
- Heatmap legend with mode-aware colors
- In-card controls:
  - **CSV export** button
  - **Refresh** button

---

## Manual installation

1. Copy [energy-heatmap-card.js](energy-heatmap-card.js) into:
   ```
   config/www/community/energy-heatmap-card/energy-heatmap-card.js
   ```

2. In Home Assistant go to **Settings -> Dashboards -> Resources** and add:
   - URL: `/local/community/energy-heatmap-card/energy-heatmap-card.js`
   - Type: **JavaScript module**

3. Restart or reload the UI.

---

## HACS installation

1. In HACS -> Frontend -> menu (⋮) -> **Custom repositories**
2. Paste your GitHub repository URL
3. Category: **Lovelace**
4. Install and reload

---

## YAML configuration

```yaml
type: custom:energy-heatmap-card
title: "Home Energy"
entity_imported: sensor.energy_imported
entity_exported: sensor.energy_exported
entity_net: sensor.energy_net
mode: net          # options: net | imported | exported
unit: kWh
days: 60           # optional, default: 60
color_scheme: green/red  # optional: green/red | purple/blue
```

### Parameters

| Parameter         | Required      | Default  | Description                                       |
|------------------|---------------|----------|---------------------------------------------------|
| `entity_imported`| Conditional*  | —        | Imported energy sensor                            |
| `entity_exported`| Conditional*  | —        | Exported energy sensor                            |
| `entity_net`     | Conditional*  | —        | Net energy sensor (imported - exported)           |
| `mode`           | No       | `net`    | Sensor to display: `net`, `imported`, `exported` |
| `title`          | No       | `Energy` | Card title                                        |
| `unit`           | No       | `kWh`    | Unit of measurement                               |
| `days`           | No       | `60`     | Number of days to display                         |
| `color_scheme`   | No       | `green/red` | Heatmap palette: `green/red` or `purple/blue` |

*At least one of `entity_imported`, `entity_exported`, or `entity_net` must be configured.

---

## Data model and daily calculation

- Fetches the selected entity history using the Home Assistant API.
- For each day, groups all states and computes the daily value:
  - In `imported` and `exported` modes, uses the **daily maximum** (final cumulative value before reset).
  - In `net` mode, uses the **last state of the day** (real daily balance, imported - exported).
- Maps values to a color gradient based on `color_scheme`:
  - **`green/red`** (default): green (exporting) and red (importing)
  - **`purple/blue`**: purple (exporting) and blue (importing), aligned with Home Assistant Energy colors

---

## CSV export

Use the **CSV** button on the card footer to download visible data.

- Filename format: `energy-<mode>-<yyyy-mm-dd>.csv`
- Encoding: UTF-8 with BOM (Excel-friendly)
- Columns:
  - `Date`
  - `Day`
  - `Energy <Mode> (<unit>)`

Example filename:

```text
energy-net-2026-05-14.csv
```

---

## Manual refresh

Use the **Refresh** button to re-fetch history immediately without reloading the whole dashboard.

---

## Configuration examples

### Net energy only (recommended)

```yaml
type: custom:energy-heatmap-card
title: "Net Energy"
entity_net: sensor.energy_net_daily
mode: net
unit: kWh
days: 60
```

### Imported energy only

```yaml
type: custom:energy-heatmap-card
title: "Grid Consumption"
entity_imported: sensor.energy_imported
mode: imported
unit: kWh
days: 30
```

### Energy dashboard-like colors

```yaml
type: custom:energy-heatmap-card
title: "Energy (HA Colors)"
entity_imported: sensor.energy_imported
entity_exported: sensor.energy_exported
entity_net: sensor.energy_net
mode: net
unit: kWh
days: 60
color_scheme: purple/blue
```

---

## Notes

- History must be enabled in Home Assistant (`recorder`).
- `utility_meter` sensors that reset daily at 12:00 work very well.
- For 60 days of data, you may need to increase recorder retention:

  ```yaml
  recorder:
    purge_keep_days: 90
  ```
