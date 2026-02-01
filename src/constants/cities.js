export const CITIES = {
  toronto: {
    name: 'Toronto',
    center: [43.6600, -79.3650], 
    start: { lat: 43.6850, lng: -79.3400 },
    end: { lat: 43.6426, lng: -79.3871 }
  },
  newyork: {
    name: 'New York (Manhattan)',
    center: [40.7300, -73.9600],
    start: { lat: 40.7710, lng: -73.9890 },
    end: { lat: 40.6950, lng: -73.9350 }
  },
  tokyo: {
    name: 'Tokyo (Bay View)',
    center: [35.6715, 139.7700],
    start: { lat: 35.7130, lng: 139.7740 },
    end: { lat: 35.6300, lng: 139.7760 }
  },
  seoul: {
    name: 'Seoul',
    center: [37.5385, 127.0200], 
    start: { lat: 37.5665, lng: 126.9780 },
    end: { lat: 37.5125, lng: 127.0588 }
  },
  barcelona: {
    name: 'Barcelona (Full Grid)',
    center: [41.3930, 2.1700], 
    start: { lat: 41.3650, lng: 2.1650 },
    end: { lat: 41.4250, lng: 2.1680 }
  },
  paris: {
    name: 'Paris (Arc de Triomphe)',
    center: [48.8738, 2.2950],
    start: { lat: 48.8870, lng: 2.3080 }, // 17th Arrondissement (North of Arc)
    end: { lat: 48.8580, lng: 2.2900 }    // Near Eiffel Tower (South of Seine)
  },
  london: {
    name: 'London (Tower Bridge)',
    center: [51.5055, -0.0754],
    start: { lat: 51.5150, lng: -0.0820 }, // City of London (Maze-like start)
    end: { lat: 51.5010, lng: -0.0720 }    // Southwark (Across the river)
  },
  sanfrancisco: {
    name: 'San Francisco (Grand Tour)',
    center: [37.7750, -122.4450], // Centered to cover the whole extended route
    waypoints: [
      { lat: 37.8199, lng: -122.4783 }, // 1. Golden Gate Bridge
      { lat: 37.8017, lng: -122.4479 }, // 2. Palace of Fine Arts
      { lat: 37.8019, lng: -122.4189 }, // 3. Lombard Street
      { lat: 37.8085, lng: -122.4155 }, // 4. Fisherman's Wharf
      { lat: 37.8024, lng: -122.4060 }, // 5. Coit Tower
      { lat: 37.7879, lng: -122.4077 }, // 6. Union Square
      { lat: 37.7763, lng: -122.4329 }, // 7. Painted Ladies
      { lat: 37.7792, lng: -122.4192 }, // 8. SF City Hall (Civic Center)
      { lat: 37.7786, lng: -122.3897 }, // 9. Oracle Park (Waterfront)
      { lat: 37.7726, lng: -122.4603 }, // 10. Conservatory of Flowers (Golden Gate Park)
      { lat: 37.7784, lng: -122.5139 }  // 11. Cliff House (Ocean End)
    ],
    start: { lat: 37.8199, lng: -122.4783 }, 
    end: { lat: 37.7784, lng: -122.5139 }
  },
  moscow: {
    name: 'Moscow (Red Square)',
    center: [55.7539, 37.6208],
    start: { lat: 55.7650, lng: 37.6250 },
    end: { lat: 55.7420, lng: 37.6150 }
  },
  dubai: {
    name: 'Dubai (Palm Jumeirah)',
    center: [25.1170, 55.1300],
    start: { lat: 25.1030, lng: 55.1550 }, // Mainland Gateway
    end: { lat: 25.1305, lng: 55.1170 }    // Atlantis The Palm
  }
};
