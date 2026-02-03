export const CITIES = {
  toronto: {
    name: 'Toronto',
    center: [43.6600, -79.3650], 
    start: { lat: 43.6850, lng: -79.3400, name: 'Danforth Ave' },
    end: { lat: 43.6426, lng: -79.3871, name: 'Union Station' }
  },
  newyork: {
    name: 'New York (BMW Q Challenge)',
    center: [40.7300, -73.9800],
    waypoints: [
      { lat: 40.7060, lng: -74.0088, name: 'Wall Street' },
      { lat: 40.7000, lng: -73.9900, name: 'Brooklyn Bridge' },
      { lat: 40.7100, lng: -73.9950, name: 'Manhattan Bridge' },
      { lat: 40.7120, lng: -73.9650, name: 'Williamsburg Bridge' },
      { lat: 40.7431, lng: -73.9541, name: 'Pulaski Bridge' },
      { lat: 40.7570, lng: -73.9550, name: 'Queensboro Bridge' },
      { lat: 40.7620, lng: -73.9680, name: 'Central Park' }
    ],
    start: { lat: 40.7060, lng: -74.0088, name: 'Wall Street' },
    end: { lat: 40.7620, lng: -73.9680, name: 'Central Park' }
  },
  tokyo: {
    name: 'Tokyo (Bay View)',
    center: [35.6715, 139.7700],
    start: { lat: 35.7130, lng: 139.7740, name: 'Ueno Park' },
    end: { lat: 35.6300, lng: 139.7760, name: 'Odaiba Bay' }
  },
  seoul: {
    name: 'Seoul',
    center: [37.5385, 127.0200], 
    start: { lat: 37.5665, lng: 126.9780, name: 'Seoul City Hall' },
    end: { lat: 37.5125, lng: 127.0588, name: 'COEX Mall' }
  },
  barcelona: {
    name: 'Barcelona (Full Grid)',
    center: [41.3930, 2.1700], 
    start: { lat: 41.3650, lng: 2.1650, name: 'Plaça d\'Espanya' },
    end: { lat: 41.4250, lng: 2.1680, name: 'Park Güell' }
  },
  paris: {
    name: 'Paris (Zigzag & Star)',
    center: [48.8600, 2.3250],
    waypoints: [
      { lat: 48.8837, lng: 2.3275, name: 'Place de Clichy' },
      { lat: 48.8738, lng: 2.2950, name: 'Arc de Triomphe' },
      { lat: 48.8616, lng: 2.2893, name: 'Trocadéro' },
      { lat: 48.8584, lng: 2.2945, name: 'Eiffel Tower' },
      { lat: 48.8566, lng: 2.3126, name: 'Les Invalides' },
      { lat: 48.8660, lng: 2.3145, name: 'Grand Palais' },
      { lat: 48.8655, lng: 2.3212, name: 'Place de la Concorde' },
      { lat: 48.8598, lng: 2.3265, name: 'Musée d\'Orsay' },
      { lat: 48.8606, lng: 2.3376, name: 'Louvre Museum' },
      { lat: 48.8530, lng: 2.3499, name: 'Notre-Dame Cathedral' },
      { lat: 48.8462, lng: 2.3464, name: 'Panthéon' }
    ],
    start: { lat: 48.8837, lng: 2.3275, name: 'Place de Clichy' },
    end: { lat: 48.8462, lng: 2.3464, name: 'Panthéon' }
  },
  london: {
    name: 'London (Tower Bridge)',
    center: [51.5055, -0.0754],
    start: { lat: 51.5150, lng: -0.0820, name: 'Bank of England' },
    end: { lat: 51.5010, lng: -0.0720, name: 'Potters Fields Park' }
  },
  sanfrancisco: {
    name: 'San Francisco (Mega Tour)',
    center: [37.7749, -122.4194], 
    waypoints: [
      { lat: 37.8324, lng: -122.4795, name: 'Golden Gate Bridge Lookout' },
      { lat: 37.8021, lng: -122.4487, name: 'Palace of Fine Arts' },
      { lat: 37.8021, lng: -122.4194, name: 'Lombard Street' },
      { lat: 37.8024, lng: -122.4058, name: 'Coit Tower' },
      { lat: 37.8087, lng: -122.4098, name: 'Pier 39' },
      { lat: 37.7786, lng: -122.3893, name: 'Oracle Park' },
      { lat: 37.7544, lng: -122.4439, name: 'Twin Peaks' },
      { lat: 37.7694, lng: -122.4862, name: 'Golden Gate Park' },
      { lat: 37.7784, lng: -122.5139, name: 'Cliff House' },
      { lat: 37.7340, lng: -122.5020, name: 'Lake Merced Park' },
      { lat: 37.7763, lng: -122.4328, name: 'Painted Ladies' }
    ],
    start: { lat: 37.8324, lng: -122.4795, name: 'Golden Gate Bridge Lookout' }, 
    end: { lat: 37.7763, lng: -122.4328, name: 'Painted Ladies' }
  },
  moscow: {
    name: 'Moscow (Red Square)',
    center: [55.7539, 37.6208],
    start: { lat: 55.7650, lng: 37.6250, name: 'Bolshoi Theatre' },
    end: { lat: 55.7420, lng: 37.6150, name: 'Cathedral of Christ the Saviour' }
  },
  dubai: {
    name: 'Dubai (Palm Jumeirah)',
    center: [25.1170, 55.1300],
    start: { lat: 25.1030, lng: 55.1550, name: 'Gateway Station' },
    end: { lat: 25.1305, lng: 55.1170, name: 'Atlantis The Palm' }
  },
  rome: {
    name: 'Rome (Ancient Labyrinth)',
    center: [41.898, 12.483], 
    waypoints: [
      { lat: 41.8902, lng: 12.4922, name: 'Colosseum' },
      { lat: 41.8945, lng: 12.4853, name: 'Imperial Fora' },
      { lat: 41.8958, lng: 12.4822, name: 'Altare della Patria' },
      { lat: 41.8992, lng: 12.4731, name: 'Piazza Navona' },
      { lat: 41.8986, lng: 12.4768, name: 'Pantheon' },
      { lat: 41.9009, lng: 12.4833, name: 'Trevi Fountain' },
      { lat: 41.9059, lng: 12.4827, name: 'Spanish Steps' },
      { lat: 41.9107, lng: 12.4764, name: 'Piazza del Popolo' },
      { lat: 41.9031, lng: 12.4663, name: 'Castel Sant\'Angelo' },
      { lat: 41.9022, lng: 12.4599, name: 'Via della Conciliazione' },
      { lat: 41.9022, lng: 12.4539, name: 'St. Peter\'s Square' }
    ],
    start: { lat: 41.8902, lng: 12.4922, name: 'Colosseum' },
    end: { lat: 41.9022, lng: 12.4539, name: 'St. Peter\'s Square' }
  },
  mexicocity: {
    name: 'Mexico City (Grid Labyrinth)',
    center: [19.4326, -99.1450], 
    waypoints: [
      { lat: 19.4204, lng: -99.1819, name: 'Chapultepec Castle' },
      { lat: 19.4162, lng: -99.1603, name: 'Roma Norte' },
      { lat: 19.4239, lng: -99.1633, name: 'Insurgentes Circle' },
      { lat: 19.4300, lng: -99.1550, name: 'Juárez Neighborhood' },
      { lat: 19.4362, lng: -99.1546, name: 'Monument to the Revolution' },
      { lat: 19.4420, lng: -99.1480, name: 'Santa Maria la Ribera' },
      { lat: 19.4360, lng: -99.1440, name: 'Alameda Central' },
      { lat: 19.4290, lng: -99.1435, name: 'Near Chinatown' },
      { lat: 19.4339, lng: -99.1404, name: 'Torre Latinoamericana' },
      { lat: 19.4380, lng: -99.1350, name: 'Historic Alleys' },
      { lat: 19.4326, lng: -99.1332, name: 'Zocalo Square' }
    ],
    start: { lat: 19.4204, lng: -99.1819, name: 'Chapultepec Castle' },
    end: { lat: 19.4326, lng: -99.1332, name: 'Zocalo Square' }
  }
};
