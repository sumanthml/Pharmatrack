import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDk9CrQCPE3JZSRbG7vkJR4l2lSE7EeGfk",
  authDomain: "pharmatree-bd345.firebaseapp.com",
  projectId: "pharmatree-bd345",
  storageBucket: "pharmatree-bd345.firebasestorage.app",
  messagingSenderId: "967797740547",
  appId: "1:967797740547:web:8ed51c6e8da24066c3ea36",
  measurementId: "G-1M5BVQJ7QY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
