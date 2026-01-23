# IoT Energy Management Dashboard

A custom ThingsBoard widget for real-time energy monitoring and analytics, built from Figma design specifications to a fully functional data-driven dashboard.

![Dashboard Preview](./assets/dashboard-preview.png)

---

## Overview

This project implements a production-grade energy management dashboard as a ThingsBoard custom widget. The dashboard visualizes real-time power consumption, cost savings, environmental impact metrics, and zone-level analytics for industrial facility monitoring.

The implementation journey spanned three distinct phases: web publishing from design mockups, ThingsBoard API and WebSocket integration, and dynamic data binding with D3.js visualizations.

---

## Technology Stack

| Category | Technology | Purpose |
|----------|------------|---------|
| **Core** | HTML5, SCSS, JavaScript (ES6+) | Structure, styling, and application logic |
| **IoT Platform** | ThingsBoard Professional Edition | Device management, telemetry, and widget framework |
| **Visualization** | D3.js v7 | SVG-based dynamic charts (line, bar) |
| **Utilities** | Lodash | Data transformation and processing |
| **Date Handling** | Moment.js | Timestamp formatting and localization |
| **Typography** | Pretendard Variable | Korean-optimized web font |
| **CI/CD** | GitHub Actions | Automated pipeline on push/PR |

---

## Project Structure

```
DashBoard-Web-Publishing-based-on-ThingsBoard/
├── dashboard.html          # Widget HTML structure and layout
├── dashboard.js            # Core logic: API calls, WebSocket, data binding
├── dashboard.scss          # Component-level styling (BEM convention)
├── dashboard.css           # Compiled stylesheet
├── _global_styles.scss     # Design tokens, color palette, typography scale
├── docs/
│   └── Documentation for Issue #1.md
└── .github/
    └── workflows/
        └── ci-test.yml     # GitHub Actions workflow
```

---

## Architecture

### Data Flow

```
ThingsBoard Platform
    │
    ├── HTTP API (Historical Data)
    │   └── GET /api/plugins/telemetry/{entityType}/{entityId}/values/timeseries
    │
    └── WebSocket API (Real-time Updates)
        └── WSS /api/ws/plugins/telemetry?token={JWT}
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│  dashboard.js                                               │
│  ├── defineVariables()    → Entity type detection           │
│  ├── loadAllTimeseries()  → Fetch historical data           │
│  ├── subscribeDatas()     → WebSocket subscription          │
│  ├── processUpdateData()  → Normalize incoming telemetry    │
│  └── updateData()         → DOM and chart updates           │
└─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│  Rendering Layer                                            │
│  ├── Text bindings        → Metrics display                 │
│  ├── Gauge bars           → Progress indicators             │
│  ├── D3.js line chart     → Monthly savings trend           │
│  ├── D3.js bar chart      → Zone power usage ranking        │
│  └── District cards       → Zone status with filtering      │
└─────────────────────────────────────────────────────────────┘
```

### Entity Type Handling

The widget dynamically adapts its data subscription strategy based on the root entity type:

| Entity Type | Filter Strategy | Use Case |
|-------------|-----------------|----------|
| `ENTITY_GROUP` | `entityGroupList` | Grouped device collections |
| `DEVICE` / `ASSET` | `deviceSearchQuery` | Individual devices with relationships |

---

## Development Journey

### Phase 1: Web Publishing

Translated Figma design specifications into semantic HTML and SCSS with pixel-perfect accuracy.

**Key deliverables:**
- Responsive two-column grid layout using CSS Grid
- BEM-structured component styling
- Design token system with SCSS variables for colors, typography, and spacing
- Static prototype with placeholder data

### Phase 2: ThingsBoard Integration

Connected the static UI to live IoT data through ThingsBoard's HTTP and WebSocket APIs.

**Key deliverables:**
- JWT-authenticated WebSocket connection for real-time telemetry
- Historical timeseries data fetching with configurable time ranges
- Polymorphic entity handling (Device, Asset, Entity Group)
- Robust error handling with try-catch blocks and fallback values

### Phase 3: Data Binding and Visualization

Implemented dynamic data binding and interactive D3.js visualizations.

**Key deliverables:**
- D3.js line chart with gradient fill for monthly power savings
- Horizontal bar chart for zone-level power consumption ranking
- Gauge bar components with percentage-based positioning
- Tabbed district card interface with status-based filtering
- Loading states to prevent UI flicker during data fetch

---

## Features

**Energy Metrics Dashboard**
- Annual and monthly power savings (kWh)
- Cost reduction tracking (KRW)
- Real-time vs. target comparison with progress indicators

**Environmental Impact**
- CO2 emission reduction calculation
- Tree equivalent visualization

**Zone Analytics**
- Per-zone power consumption ranking
- Device operational status (Normal, Warning, Inspection Required)
- Control mode distribution (Cost Reduction, Target Reduction, Manual)

**Real-time Updates**
- WebSocket-based live data streaming
- Automatic UI refresh on telemetry updates

---

## Widget Integration

This dashboard is designed to run within the ThingsBoard widget framework. To deploy:

1. Create a new custom widget in ThingsBoard
2. Copy `dashboard.html` content to the HTML tab
3. Copy `dashboard.js` content to the JavaScript tab
4. Copy `dashboard.css` content to the CSS tab
5. Configure the widget datasource with the target entity

The widget expects the following telemetry keys:
- `totalSavedPower`, `totalSavedCost`, `totalSavedCO2`, `totalTreeCount`
- `powerUsage`, `estimatedCost`
- `status`, `controlMode`, `currentTemperature`

---

## API Reference

### HTTP Endpoint

```
GET /api/plugins/telemetry/{entityType}/{entityId}/values/timeseries
    ?keys={comma-separated-keys}
    &startTs={epoch-ms}
    &endTs={epoch-ms}
    &agg=NONE
    &orderBy=ASC
    &useStrictDataTypes=true
```

### WebSocket Command Structure

```json
{
  "entityDataCmds": [{
    "query": {
      "entityFilter": { "type": "entityGroupList", "entityGroupIds": [...] },
      "pageLink": { "pageSize": 1024 },
      "entityFields": [...],
      "latestValues": [...]
    },
    "cmdId": 1
  }]
}
```

---

## Documentation

Detailed technical documentation is available in the `docs/` directory:

- [Issue #1 Resolution](./docs/Documentation%20for%20Issue%20%231.md): Device Group data parsing and dynamic entity type detection

---

## License

This project was developed as part of an internship program. Please contact the repository owner for licensing information.
