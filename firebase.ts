// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
const analytics = getAnalytics(app);