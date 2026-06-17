const getBackendUrl = () => {
  const hostname = window.location.hostname;
  // If accessing the app via local network IP or custom domain, redirect API calls to that host on port 5000
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:5000`;
  }
  return 'http://localhost:5000';
};

export const API_BASE_URL = getBackendUrl();
