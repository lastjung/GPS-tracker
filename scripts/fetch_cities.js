
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Constants from src/constants/cities.js
const CITIES = {
  toronto: { center: [43.6600, -79.3650] },
  newyork: { center: [40.7300, -73.9600] },
  tokyo: { center: [35.6715, 139.7700] },
  seoul: { center: [37.5385, 127.0200] },
  barcelona: { center: [41.3930, 2.1700] },
  paris: { center: [48.8738, 2.2950] },
  london: { center: [51.5055, -0.0754] },
  sanfrancisco: { center: [37.8150, -122.4750] },
  moscow: { center: [55.7539, 37.6208] },
  dubai: { center: [25.1170, 55.1300] }
};

const DELTA = 0.035; // Slightly larger coverage (approx 4km radius)

const makeQuery = (b) => `
  [out:json][timeout:180];
  way["highway"~"motorway|trunk|primary|secondary|tertiary|residential"](${b.south},${b.west},${b.north},${b.east});
  (._;>;);
  out body;
`;

const fetchCity = async (key, center) => {
  const [lat, lng] = center;
  const bounds = {
    south: lat - DELTA,
    west: lng - DELTA,
    north: lat + DELTA,
    east: lng + DELTA
  };

  const query = makeQuery(bounds);
  // Using multiple endpoints for redundancy
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  console.log(`Fetching data for ${key}...`);

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const elements = data.elements || [];
      if (elements.length < 100) {
        throw new Error('Data too small, likely incomplete');
      }

      const filePath = path.join('public', 'data', `${key}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data));
      console.log(`Saved ${key}.json (${(JSON.stringify(data).length / 1024 / 1024).toFixed(2)} MB)`);
      return;
    } catch (err) {
      console.warn(`Failed to fetch ${key} from ${endpoint}: ${err.message}`);
    }
  }
  console.error(`Failed to fetch data for ${key} from all endpoints.`);
};

const main = async () => {
  for (const [key, city] of Object.entries(CITIES)) {
    // Check if file already exists to avoid re-fetching if not needed (optional, but good for retries)
    // For now, we overwrite to ensure fresh data with new DELTA
    await fetchCity(key, city.center);
    // Wait a bit to be nice to the API
    await new Promise(r => setTimeout(r, 2000));
  }
};

main();
