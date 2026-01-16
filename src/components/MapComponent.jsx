import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon issues in React-Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

function LocationMarker({ positions, setPositions, setRoute }) {
  const map = useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      if (!positions.start) {
        setPositions(prev => ({ ...prev, start: [lat, lng] }));
      } else if (!positions.end) {
        setPositions(prev => ({ ...prev, end: [lat, lng] }));
      } else {
        // Reset if both exist and user clicks again
        setPositions({ start: [lat, lng], end: null });
        setRoute([]);
      }
    },
  });

  return null;
}

const MapComponent = () => {
  const [positions, setPositions] = useState({ start: null, end: null });
  const [route, setRoute] = useState([]);

  useEffect(() => {
    if (positions.start && positions.end) {
      const fetchRoute = async () => {
        const start = positions.start;
        const end = positions.end;
        // OSRM requires longitude,latitude
        const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
        
        try {
          const response = await fetch(url);
          const data = await response.json();
          if (data.routes && data.routes.length > 0) {
            const coords = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]); // Flip to lat,lng
            setRoute(coords);
          }
        } catch (error) {
          console.error("Error fetching route:", error);
        }
      };
      fetchRoute();
    }
  }, [positions]);

  return (
    <div className='relative w-full h-screen'>
        <div className="absolute top-4 left-4 z-[1000] bg-gray-900/80 p-4 rounded-lg text-white pointer-events-auto backdrop-blur-sm border border-gray-700">
            <h2 className="text-xl font-bold mb-2 text-green-400">GPS Tracker</h2>
            <p className="text-sm text-gray-300 mb-2">Click map to set Start and End points.</p>
            <div className="flex flex-col gap-1 text-xs">
                <div>Start: {positions.start ? `${positions.start[0].toFixed(4)}, ${positions.start[1].toFixed(4)}` : 'Not set'}</div>
                <div>End: {positions.end ? `${positions.end[0].toFixed(4)}, ${positions.end[1].toFixed(4)}` : 'Not set'}</div>
            </div>
        </div>

        <MapContainer center={[37.5665, 126.9780]} zoom={13} scrollWheelZoom={true} className="w-full h-full">
            {/* CartoDB Dark Matter Tiles */}
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            <LocationMarker positions={positions} setPositions={setPositions} setRoute={setRoute} />
            
            {positions.start && <Marker position={positions.start}><Popup>Start Point</Popup></Marker>}
            {positions.end && <Marker position={positions.end}><Popup>End Point</Popup></Marker>}
            
            {route.length > 0 && <Polyline positions={route} color="#a3e635" weight={5} opacity={0.8} />}
        </MapContainer>
    </div>
  );
};

export default MapComponent;
