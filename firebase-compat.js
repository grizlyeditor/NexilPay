// firebase-compat.js - Compatibility Version (for direct HTML use)

// Load Firebase SDKs from CDN
// Add these to your HTML:
// <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>

const FirebaseCompat = (function() {
    'use strict';
    
    let isInitialized = false;
    let auth = null;
    let db = null;
    
    // Public Firebase config
    const firebaseConfig = {
        apiKey: "AIzaSyCjEaeM-LccF69A84ppSfbP-vhVKInCQyM", // YOUR API KEY HERE
        authDomain: "ejene-d8ff7.firebaseapp.com",
        projectId: "ejene-d8ff7",
        storageBucket: "ejene-d8ff7.firebasestorage.app",
        messagingSenderId: "612166184659",
        appId: "1:612166184659:web:f8642069f141bb219b6e26" // YOUR APP ID HERE
    };
    
    // Initialize Firebase
    function initialize() {
        if (isInitialized) {
            console.warn("Firebase already initialized");
            return;
        }
        
        try {
            // Initialize Firebase
            firebase.initializeApp(firebaseConfig);
            
            // Get services
            auth = firebase.auth();
            db = firebase.firestore();
            
            // Enable offline persistence
            db.enablePersistence()
                .catch((err) => {
                    console.warn("Offline persistence failed:", err.code);
                });
            
            isInitialized = true;
            console.log("Firebase initialized successfully");
            
        } catch (error) {
            console.error("Firebase initialization error:", error);
            throw error;
        }
    }
    
    // Auth functions
    async function registerUser(email, password, username, cnic) {
        try {
            // Create user in Firebase Auth
            const userCredential = await auth.createUserWithEmailAndPassword(email || cnic, password);
            const user = userCredential.user;
            
            // Create user document
            await db.collection('users').doc(user.uid).set({
                uid: user.uid,
                email: email || cnic,
                cnic: cnic,
                username: username.toLowerCase(),
                password: password,
                usdBalance: 0.00,
                ronBalance: 0.00,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active'
            });
            
            // Create wallet
            await db.collection('wallets').doc(user.uid).set({
                userId: user.uid,
                transactions: [],
                totalSent: 0,
                totalReceived: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            return { success: true, user: user };
            
        } catch (error) {
            console.error("Register error:", error);
            throw error;
        }
    }
    
    async function loginUser(email, password) {
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            
            // Update last login
            await db.collection('users').doc(userCredential.user.uid).update({
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error("Login error:", error);
            throw error;
        }
    }
    
    async function logoutUser() {
        try {
            await auth.signOut();
            return { success: true };
        } catch (error) {
            console.error("Logout error:", error);
            throw error;
        }
    }
    
    // Firestore functions
    async function getUserData(userId) {
        try {
            const doc = await db.collection('users').doc(userId).get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error("Get user error:", error);
            throw error;
        }
    }
    
    async function updateBalance(userId, currency, amount, operation = 'add') {
        try {
            const field = currency.toLowerCase() + 'Balance';
            const updateData = {};
            
            if (operation === 'add') {
                updateData[field] = firebase.firestore.FieldValue.increment(amount);
            } else if (operation === 'subtract') {
                updateData[field] = firebase.firestore.FieldValue.increment(-amount);
            }
            
            await db.collection('users').doc(userId).update(updateData);
            return true;
        } catch (error) {
            console.error("Update balance error:", error);
            throw error;
        }
    }
    
    async function sendMoney(senderId, receiverId, amount, currency) {
        try {
            const batch = db.batch();
            const transactionId = 'TXN' + Date.now();
            
            // Get sender and receiver data
            const senderDoc = await db.collection('users').doc(senderId).get();
            const receiverDoc = await db.collection('users').doc(receiverId).get();
            
            if (!senderDoc.exists || !receiverDoc.exists) {
                throw new Error("User not found");
            }
            
            const senderData = senderDoc.data();
            const receiverData = receiverDoc.data();
            const balanceField = currency.toLowerCase() + 'Balance';
            
            // Check balance
            if (senderData[balanceField] < amount) {
                throw new Error("Insufficient balance");
            }
            
            // Update sender balance
            const senderRef = db.collection('users').doc(senderId);
            batch.update(senderRef, {
                [balanceField]: firebase.firestore.FieldValue.increment(-amount)
            });
            
            // Update receiver balance
            const receiverRef = db.collection('users').doc(receiverId);
            batch.update(receiverRef, {
                [balanceField]: firebase.firestore.FieldValue.increment(amount)
            });
            
            // Create transaction records
            const transaction = {
                id: transactionId,
                senderId: senderId,
                senderUsername: senderData.username,
                receiverId: receiverId,
                receiverUsername: receiverData.username,
                amount: amount,
                currency: currency,
                timestamp: new Date().toISOString(),
                status: 'completed'
            };
            
            // Add to sender's transactions
            const senderWalletRef = db.collection('wallets').doc(senderId);
            batch.update(senderWalletRef, {
                transactions: firebase.firestore.FieldValue.arrayUnion({
                    ...transaction,
                    type: 'sent'
                }),
                totalSent: firebase.firestore.FieldValue.increment(amount)
            });
            
            // Add to receiver's transactions
            const receiverWalletRef = db.collection('wallets').doc(receiverId);
            batch.update(receiverWalletRef, {
                transactions: firebase.firestore.FieldValue.arrayUnion({
                    ...transaction,
                    type: 'received'
                }),
                totalReceived: firebase.firestore.FieldValue.increment(amount)
            });
            
            // Commit batch
            await batch.commit();
            
            return {
                success: true,
                transactionId: transactionId
            };
            
        } catch (error) {
            console.error("Send money error:", error);
            throw error;
        }
    }
    
    // Utility functions
    function generateCNIC() {
        const randomMiddle = Math.floor(Math.random() * 900000) + 100000;
        return `nexi@${randomMiddle.toString().padStart(6, '0')}.com`;
    }
    
    function generatePassword() {
        const randomNum = Math.floor(Math.random() * 900000) + 100000;
        return `${randomNum}"`;
    }
    
    function generateRedeemCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 16; i++) {
            if (i > 0 && i % 4 === 0) code += '-';
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
    
    // Public API
    return {
        initialize,
        config: firebaseConfig,
        
        // Auth
        auth: () => auth,
        db: () => db,
        registerUser,
        loginUser,
        logoutUser,
        
        // User operations
        getUserData,
        updateBalance,
        sendMoney,
        
        // Utility
        generateCNIC,
        generatePassword,
        generateRedeemCode,
        
        // Status
        isInitialized: () => isInitialized
    };
})();

// Auto-initialize when loaded
if (typeof window !== 'undefined') {
    window.FirebaseCompat = FirebaseCompat;
    
    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof firebase !== 'undefined') {
            FirebaseCompat.initialize();
        }
    });
}