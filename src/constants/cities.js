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
    name: 'Paris (Zigzag & Star)',
    center: [48.8600, 2.3250],
    waypoints: [
      { lat: 48.8837, lng: 2.3275 }, // 1. Place de Clichy (Radial Entry Start)
      { lat: 48.8738, lng: 2.2950 }, // 2. Arc de Triomphe (The Star Hub)
      { lat: 48.8616, lng: 2.2893 }, // 3. Trocadéro
      { lat: 48.8584, lng: 2.2945 }, // 4. Eiffel Tower (Crossing 1)
      { lat: 48.8566, lng: 2.3126 }, // 5. Les Invalides
      { lat: 48.8660, lng: 2.3145 }, // 6. Grand Palais (Crossing 2 - Pont Alexandre III)
      { lat: 48.8655, lng: 2.3212 }, // 7. Place de la Concorde
      { lat: 48.8598, lng: 2.3265 }, // 8. Musée d'Orsay (Crossing 3)
      { lat: 48.8606, lng: 2.3376 }, // 9. Louvre Museum (Crossing 4)
      { lat: 48.8530, lng: 2.3499 }, // 10. Notre-Dame Cathedral
      { lat: 48.8462, lng: 2.3464 }  // 11. Panthéon (End)
    ],
    start: { lat: 48.8837, lng: 2.3275 },
    end: { lat: 48.8462, lng: 2.3464 }
  },
  london: {
    name: 'London (Tower Bridge)',
    center: [51.5055, -0.0754],
    start: { lat: 51.5150, lng: -0.0820 }, // City of London (Maze-like start)
    end: { lat: 51.5010, lng: -0.0720 }    // Southwark (Across the river)
  },
  sanfrancisco: {
    name: 'San Francisco (Mega Tour)',
    center: [37.7749, -122.4194], 
    waypoints: [
      { lat: 37.8324, lng: -122.4795 }, // 1. Golden Gate Bridge (Vista Point North)
      { lat: 37.8021, lng: -122.4487 }, // 2. Palace of Fine Arts
      { lat: 37.8021, lng: -122.4194 }, // 3. Lombard Street (Hyde & Lombard)
      { lat: 37.8024, lng: -122.4058 }, // 4. Coit Tower (Telegraph Hill)
      { lat: 37.8087, lng: -122.4098 }, // 5. Pier 39
      { lat: 37.7786, lng: -122.3893 }, // 6. Oracle Park (Waterfront)
      { lat: 37.7544, lng: -122.4439 }, // 7. Twin Peaks (The most curvy road)
      { lat: 37.7694, lng: -122.4862 }, // 8. Golden Gate Park (Music Concourse)
      { lat: 37.7784, lng: -122.5139 }, // 9. Cliff House (Ocean Beach)
      { lat: 37.7340, lng: -122.5020 }, // 10. Zoo/Lake Merced (Southwest edge)
      { lat: 37.7763, lng: -122.4328 }  // 11. Painted Ladies (End)
    ],
    start: { lat: 37.8324, lng: -122.4795 }, 
    end: { lat: 37.7763, lng: -122.4328 }
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
  },
  rome: {
    name: 'Rome (Ancient Labyrinth)',
    center: [41.898, 12.483], 
    waypoints: [
      { lat: 41.8902, lng: 12.4922 }, // 1. Colosseum (Start)
      { lat: 41.8945, lng: 12.4853 }, // 2. Imperial Fora
      { lat: 41.8958, lng: 12.4822 }, // 3. Altare della Patria
      { lat: 41.8992, lng: 12.4731 }, // 4. Piazza Navona
      { lat: 41.8986, lng: 12.4768 }, // 5. Pantheon
      { lat: 41.9009, lng: 12.4833 }, // 6. Trevi Fountain
      { lat: 41.9059, lng: 12.4827 }, // 7. Spanish Steps
      { lat: 41.9107, lng: 12.4764 }, // 8. Piazza del Popolo
      { lat: 41.9031, lng: 12.4663 }, // 9. Castel Sant'Angelo
      { lat: 41.9022, lng: 12.4599 }, // 10. Via della Conciliazione
      { lat: 41.9022, lng: 12.4539 }  // 11. St. Peter's Square (End)
    ],
    start: { lat: 41.8902, lng: 12.4922 },
    end: { lat: 41.9022, lng: 12.4539 }
  },
  mexicocity: {
    name: 'Mexico City (Grid Labyrinth)',
    center: [19.4326, -99.1450], 
    waypoints: [
      { lat: 19.4204, lng: -99.1819 }, // 1. Chapultepec Castle (Start)
      { lat: 19.4162, lng: -99.1603 }, // 2. Roma Norte (South of Reforma)
      { lat: 19.4239, lng: -99.1633 }, // 3. Insurgentes Circle (The Labyrinth Hub)
      { lat: 19.4300, lng: -99.1550 }, // 4. Juárez Neighborhood (Zigzag)
      { lat: 19.4362, lng: -99.1546 }, // 5. Monument to the Revolution
      { lat: 19.4420, lng: -99.1480 }, // 6. Santa Maria la Ribera (North of Reforma)
      { lat: 19.4360, lng: -99.1440 }, // 7. Alameda Central
      { lat: 19.4290, lng: -99.1435 }, // 8. Near Chinatown (South of Alameda)
      { lat: 19.4339, lng: -99.1404 }, // 9. Torre Latinoamericana
      { lat: 19.4380, lng: -99.1350 }, // 10. Historic Alleys (Deep Grid)
      { lat: 19.4326, lng: -99.1332 }  // 11. Zocalo (End)
    ],
    start: { lat: 19.4204, lng: -99.1819 },
    end: { lat: 19.4326, lng: -99.1332 }
  }
};
