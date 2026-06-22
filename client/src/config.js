const getBackendUrl = () => {
  // Allow overriding the API base URL via env variables on production hosting platforms (like Vercel)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  const hostname = window.location.hostname;
  // If accessing the app via local network IP or custom domain, redirect API calls to that host on port 5000
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    // If it's a deployed production Vercel domain, default to Render production URL
    if (hostname.endsWith('.vercel.app') || hostname.endsWith('.vercel.dev')) {
      return 'https://pharmatrack-backend.onrender.com';
    }
    return `http://${hostname}:5000`;
  }
  return 'http://localhost:5000';
};

export const API_BASE_URL = getBackendUrl();
