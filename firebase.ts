
import { initializeApp } from "firebase/app";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDiVIM4I6XLyHh2Ca7G9RhR4rgY4n7BSU8",
  authDomain: "stok-3c144.firebaseapp.com",
  projectId: "stok-3c144",
  storageBucket: "stok-3c144.firebasestorage.app",
  messagingSenderId: "502647106359",
  appId: "1:502647106359:web:da9427bde3fa10665ac8b2",
  measurementId: "G-X1SN9QFJ0R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firestore instance as 'db'
export const db = getFirestore(app);
