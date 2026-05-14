# Energy Heatmap Card

Tarjeta personalizada para Home Assistant (Lovelace) que muestra un **mapa de calor** de los últimos N días de energía.

Diseñada para sensores que se **resetean diariamente a las 12:00** (el valor acumulado del día se toma como el máximo registrado antes del reset).

---

## Instalación manual

1. Copia `energy-heatmap-card.js` a tu carpeta:
   ```
   config/www/community/energy-heatmap-card/energy-heatmap-card.js
   ```

2. En Home Assistant ve a **Ajustes → Dashboards → Recursos** y agrega:
   - URL: `/local/community/energy-heatmap-card/energy-heatmap-card.js`
   - Tipo: **JavaScript module**

3. Reinicia o recarga la interfaz.

---

## Instalación vía HACS

1. En HACS → Frontend → Menú (⋮) → **Repositorios personalizados**
2. Pega la URL de tu repositorio GitHub
3. Categoría: **Lovelace**
4. Instala y recarga

---

## Configuración YAML

```yaml
type: custom:energy-heatmap-card
title: "Energía Casa"
entity_imported: sensor.energia_importada
entity_exported: sensor.energia_exportada
entity_net: sensor.energia_neta
mode: net          # opciones: net | imported | exported
unit: kWh
days: 60           # opcional, default: 60
```

### Parámetros

| Parámetro         | Requerido | Default             | Descripción                                          |
|-------------------|-----------|---------------------|------------------------------------------------------|
| `entity_imported` | Sí*       | —                   | Sensor de energía importada                          |
| `entity_exported` | No        | —                   | Sensor de energía exportada                          |
| `entity_net`      | Sí*       | —                   | Sensor de energía neta (importada − exportada)       |
| `mode`            | No        | `net`               | Qué sensor mostrar: `net`, `imported`, `exported`    |
| `title`           | No        | `"Energía"`         | Título de la tarjeta                                 |
| `unit`            | No        | `kWh`               | Unidad de medida                                     |
| `days`            | No        | `60`                | Número de días a mostrar                             |

*Al menos uno de `entity_imported` o `entity_net` es requerido.

---

## Cómo funciona

- Consulta el historial de la entidad usando la API de Home Assistant
- Para cada día agrupa todos los estados y toma el **valor máximo** (el acumulado final antes del reset de las 12:00)
- Mapea los valores a un gradiente de color:
  - **Modo net**: verde (exportando) → negro (cero) → naranja/rojo (importando)
  - **Modo imported**: degradado naranja (más claro = menos consumo)
  - **Modo exported**: degradado verde (más claro = menos exportación)
- Al pasar el cursor sobre una celda se muestra tooltip con fecha y valor exacto

---

## Ejemplos de configuración

### Solo energía neta (recomendado)
```yaml
type: custom:energy-heatmap-card
title: "Energía Neta"
entity_net: sensor.energia_neta_diaria
mode: net
unit: kWh
days: 60
```

### Solo importación
```yaml
type: custom:energy-heatmap-card
title: "Consumo de Red"
entity_imported: sensor.energia_importada
mode: imported
unit: kWh
days: 30
```

---

## Notas

- El historial debe estar habilitado en Home Assistant (`recorder`)
- Los sensores tipo `utility_meter` que resetean a las 12:00 funcionan perfectamente
- Para 60 días se puede necesitar ajustar `purge_keep_days` en la config del recorder:
  ```yaml
  recorder:
    purge_keep_days: 90
  ```
