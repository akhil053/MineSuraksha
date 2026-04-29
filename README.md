# MineSuraksha
# MineSuraksha Dashboard

MineSuraksha is a smart safety dashboard for a connected mining helmet system. It is designed to visualize live environmental and motion telemetry from an ESP-based receiver and optional phone sensor input, helping operators monitor worker safety in real time.

The dashboard focuses on hazard awareness, route tracking, tunnel movement estimation, and emergency visibility in a single interface.

## Features

- Live telemetry cards for gas, temperature, humidity, and heart rate
- GPS route tracking with a live map
- Tunnel depth and direction visualization based on movement and tilt
- SOS emergency banner and countdown overlay
- Low-power sentry mode panel for battery-saving wake logic
- Theme toggle for light and dark viewing
- Support for combining receiver ESP data and phone sensor data

## Tech Stack

- Next.js 14
- React 18
- Leaflet for mapping
- App Router API routes for telemetry aggregation

## Project Structure

- `app/page.jsx`
  Main dashboard UI and client-side telemetry logic
- `app/layout.jsx`
  Global layout, fonts, and Leaflet asset loading
- `app/globals.css`
  Complete dashboard styling
- `app/api/esp-data/route.js`
  Reads telemetry from the receiver ESP device
- `app/api/phone-data/route.js`
  Accepts and serves phone-based GPS and motion data

## How It Works

The dashboard polls two sources:

1. The receiver ESP endpoint through `/api/esp-data?ip=<receiver-ip>`
2. The local phone telemetry bridge through `/api/phone-data`

These values are normalized and merged into a single live dashboard state. The app then updates:

- safety gauges
- map position and route history
- tunnel profile
- SOS state
- sentry mode status

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Run in development mode

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

### 3. Run the production build locally

```bash
npm run build
npm run start -- -p 3000
```

## Using the Dashboard

### Without hardware

The UI can still be opened and reviewed without a connected ESP device. In that case, the dashboard will load, but live telemetry will remain stale or unavailable.

### With receiver ESP hardware

1. Power on the receiver ESP device.
2. Make sure your computer is on the same Wi-Fi network.
3. Enter the receiver IP address in the `Receiver ESP32 IP` field.
4. Click `Connect`.
5. The dashboard will begin polling the receiver endpoint.

### With phone telemetry

If a phone sensor sender posts data to `/api/phone-data`, the dashboard can use phone-based GPS, motion, and orientation values together with receiver telemetry.

## Expected Telemetry Fields

The dashboard currently supports these values:

- `gasPpm`
- `temperatureC`
- `humidity` or `humidityPct`
- `heartRate`
- `lat`
- `lng`
- `alpha`
- `beta`
- `gamma`
- `motion`
- `sos`
- `timestamp`
- `online`

## SOS Flow

When `sos` becomes `true`, the dashboard shows:

- an SOS alert banner
- an emergency countdown overlay
- a simulated call state with emergency contact details
- an SOS marker on the map

## Low-Power Sentry Mode

The dashboard includes a low-power sentry section that explains the intended embedded behavior:

- the controller remains in low-power mode during idle periods
- it wakes on a fixed interval such as every 10 seconds
- it can also wake immediately on hardware interrupts such as a fall or SOS event

This is currently visualized at the dashboard level and can later be tied directly to firmware-reported wake reasons.

## Notes

- The map uses Leaflet loaded from CDN in `app/layout.jsx`
- If you see chunk-related Next.js errors such as missing `.js` files inside `.next`, remove the `.next` folder and rebuild
- If port `3000` is already in use, run on another port with:

```bash
npm run dev -- -p 3001
```

## Future Improvements

- Real phone sender page for GPS and gyro streaming
- Firmware-backed sentry mode status
- Real emergency calling integration
- Sensor calibration controls
- Historical telemetry storage

## License

This project is intended for academic, prototype, and demonstration use unless a separate license is added.
