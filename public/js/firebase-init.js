import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, addDoc, getDoc, getDocs, updateDoc,
  deleteDoc, query, where, orderBy, serverTimestamp, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getBytes, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  collection, doc, setDoc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, onSnapshot,
  ref, uploadBytes, getBytes, getDownloadURL, deleteObject,
};

export const CONFIG_IS_DEFAULT = firebaseConfig.apiKey === "YOUR_API_KEY";
