// firebase.js - Complete Firebase Configuration & Services

// Firebase App (the core Firebase SDK) is always required
import { initializeApp } from "firebase/app";

// Firebase Services
import { 
    getAuth, 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updateProfile,
    sendEmailVerification
} from "firebase/auth";

import {
    getFirestore,
    collection,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    addDoc,
    serverTimestamp,
    increment,
    arrayUnion,
    arrayRemove,
    writeBatch,
    runTransaction
} from "firebase/firestore";

// Firebase Configuration - YOUR ACTUAL CONFIG HERE
const firebaseConfig = {
    apiKey: "AIzaSyCjEaeM-LccF69A84ppSfbP-vhVKInCQyM", // Replace with your actual API key
    authDomain: "ejene-d8ff7.firebaseapp.com",
    projectId: "ejene-d8ff7",
    storageBucket: "ejene-d8ff7.firebasestorage.app",
    messagingSenderId: "612166184659",
    appId: "1:612166184659:web:f8642069f141bb219b6e26", // Replace with your actual app ID
    measurementId: "G-X5P6ZE1Z9F" // Optional
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
const auth = getAuth(app);
const db = getFirestore(app);

// Export services
export {
    // App
    app,
    
    // Auth
    auth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updateProfile,
    sendEmailVerification,
    
    // Firestore
    db,
    collection,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    addDoc,
    serverTimestamp,
    increment,
    arrayUnion,
    arrayRemove,
    writeBatch,
    runTransaction
};

// Helper Functions
export const FirebaseService = {
    
    // ========== USER MANAGEMENT ==========
    
    // Register new user with wallet
    async registerUser(userData) {
        try {
            const { email, password, username, cnic } = userData;
            
            // 1. Create authentication user
            const userCredential = await createUserWithEmailAndPassword(auth, email || cnic, password);
            const user = userCredential.user;
            
            // 2. Create user document
            const userDocRef = doc(db, 'users', user.uid);
            await setDoc(userDocRef, {
                uid: user.uid,
                email: email || cnic,
                cnic: cnic,
                username: username.toLowerCase(),
                password: password,
                usdBalance: 0.00,
                ronBalance: 0.00,
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp(),
                status: 'active',
                accountType: 'user',
                isVerified: false
            });
            
            // 3. Create wallet document
            const walletDocRef = doc(db, 'wallets', user.uid);
            await setDoc(walletDocRef, {
                userId: user.uid,
                totalUSD: 0.00,
                totalRON: 0.00,
                totalSent: 0.00,
                totalReceived: 0.00,
                transactions: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            
            // 4. Create transactions subcollection
            const transactionsRef = collection(db, 'users', user.uid, 'transactions');
            await addDoc(transactionsRef, {
                type: 'account_created',
                amount: 0,
                currency: 'USD',
                description: 'Account created successfully',
                timestamp: serverTimestamp(),
                status: 'completed'
            });
            
            return {
                success: true,
                user: user,
                userId: user.uid
            };
            
        } catch (error) {
            console.error("Register error:", error);
            throw error;
        }
    },
    
    // Login user
    async loginUser(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            
            // Update last login
            const userDocRef = doc(db, 'users', userCredential.user.uid);
            await updateDoc(userDocRef, {
                lastLogin: serverTimestamp()
            });
            
            return {
                success: true,
                user: userCredential.user
            };
        } catch (error) {
            console.error("Login error:", error);
            throw error;
        }
    },
    
    // Get user data
    async getUserData(userId) {
        try {
            const userDocRef = doc(db, 'users', userId);
            const userDoc = await getDoc(userDocRef);
            
            if (userDoc.exists()) {
                return userDoc.data();
            }
            return null;
        } catch (error) {
            console.error("Get user error:", error);
            throw error;
        }
    },
    
    // Update user balance
    async updateBalance(userId, currency, amount, operation = 'add') {
        try {
            const field = currency.toLowerCase() + 'Balance';
            const userDocRef = doc(db, 'users', userId);
            
            if (operation === 'add') {
                await updateDoc(userDocRef, {
                    [field]: increment(amount)
                });
            } else if (operation === 'subtract') {
                await updateDoc(userDocRef, {
                    [field]: increment(-amount)
                });
            }
            
            return true;
        } catch (error) {
            console.error("Update balance error:", error);
            throw error;
        }
    },
    
    // ========== WALLET OPERATIONS ==========
    
    // Send money between users
    async sendMoney(senderId, receiverIdentifier, amount, currency) {
        try {
            // Find receiver by username or CNIC
            let receiverData = null;
            let receiverId = null;
            
            // Try username first
            const usernameQuery = query(
                collection(db, 'users'),
                where('username', '==', receiverIdentifier.toLowerCase()),
                limit(1)
            );
            
            const usernameSnapshot = await getDocs(usernameQuery);
            
            if (!usernameSnapshot.empty) {
                receiverData = usernameSnapshot.docs[0].data();
                receiverId = usernameSnapshot.docs[0].id;
            } else {
                // Try CNIC
                const cnicQuery = query(
                    collection(db, 'users'),
                    where('cnic', '==', receiverIdentifier),
                    limit(1)
                );
                
                const cnicSnapshot = await getDocs(cnicQuery);
                if (!cnicSnapshot.empty) {
                    receiverData = cnicSnapshot.docs[0].data();
                    receiverId = cnicSnapshot.docs[0].id;
                }
            }
            
            if (!receiverId) {
                throw new Error("Receiver not found");
            }
            
            if (senderId === receiverId) {
                throw new Error("Cannot send money to yourself");
            }
            
            // Check sender balance
            const senderData = await this.getUserData(senderId);
            const balanceField = currency.toLowerCase() + 'Balance';
            
            if (senderData[balanceField] < amount) {
                throw new Error(`Insufficient ${currency} balance`);
            }
            
            // Use batch for atomic operations
            const batch = writeBatch(db);
            
            // Generate transaction ID
            const transactionId = 'TXN_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // 1. Deduct from sender
            const senderRef = doc(db, 'users', senderId);
            batch.update(senderRef, {
                [balanceField]: increment(-amount),
                updatedAt: serverTimestamp()
            });
            
            // 2. Add to receiver
            const receiverRef = doc(db, 'users', receiverId);
            batch.update(receiverRef, {
                [balanceField]: increment(amount),
                updatedAt: serverTimestamp()
            });
            
            // 3. Create transaction record for sender
            const senderTransactionRef = doc(collection(db, 'transactions'));
            batch.set(senderTransactionRef, {
                id: transactionId,
                type: 'sent',
                senderId: senderId,
                senderUsername: senderData.username,
                receiverId: receiverId,
                receiverUsername: receiverData.username,
                amount: amount,
                currency: currency,
                timestamp: serverTimestamp(),
                status: 'completed',
                notes: `Sent to ${receiverData.username}`
            });
            
            // 4. Create transaction record for receiver
            const receiverTransactionRef = doc(collection(db, 'transactions'));
            batch.set(receiverTransactionRef, {
                id: transactionId,
                type: 'received',
                senderId: senderId,
                senderUsername: senderData.username,
                receiverId: receiverId,
                receiverUsername: receiverData.username,
                amount: amount,
                currency: currency,
                timestamp: serverTimestamp(),
                status: 'completed',
                notes: `Received from ${senderData.username}`
            });
            
            // 5. Update wallets
            const senderWalletRef = doc(db, 'wallets', senderId);
            batch.update(senderWalletRef, {
                totalSent: increment(amount),
                updatedAt: serverTimestamp()
            });
            
            const receiverWalletRef = doc(db, 'wallets', receiverId);
            batch.update(receiverWalletRef, {
                totalReceived: increment(amount),
                updatedAt: serverTimestamp()
            });
            
            // Commit batch
            await batch.commit();
            
            return {
                success: true,
                transactionId: transactionId,
                receiver: receiverData.username
            };
            
        } catch (error) {
            console.error("Send money error:", error);
            throw error;
        }
    },
    
    // Get wallet transactions
    async getTransactions(userId, limitCount = 10) {
        try {
            const transactionsQuery = query(
                collection(db, 'transactions'),
                where('senderId', '==', userId),
                orderBy('timestamp', 'desc'),
                limit(limitCount)
            );
            
            const snapshot = await getDocs(transactionsQuery);
            const transactions = [];
            
            snapshot.forEach(doc => {
                transactions.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            return transactions;
        } catch (error) {
            console.error("Get transactions error:", error);
            throw error;
        }
    },
    
    // ========== REDEEM CODE SYSTEM ==========
    
    // Create redeem code
    async createRedeemCode(creatorId, amount, currency) {
        try {
            // Check creator balance
            const creatorData = await this.getUserData(creatorId);
            const balanceField = currency.toLowerCase() + 'Balance';
            
            if (creatorData[balanceField] < amount) {
                throw new Error(`Insufficient ${currency} balance`);
            }
            
            // Generate unique code
            const code = this.generateRedeemCode();
            
            // Deduct amount from creator
            await this.updateBalance(creatorId, currency, amount, 'subtract');
            
            // Create redeem code document
            const redeemCodeRef = doc(db, 'redeemCodes', code);
            await setDoc(redeemCodeRef, {
                code: code,
                amount: amount,
                currency: currency,
                createdBy: creatorId,
                createdByUsername: creatorData.username,
                createdAt: serverTimestamp(),
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                isRedeemed: false,
                status: 'active'
            });
            
            // Record transaction
            const transactionRef = doc(collection(db, 'transactions'));
            await setDoc(transactionRef, {
                type: 'redeem_created',
                userId: creatorId,
                amount: amount,
                currency: currency,
                code: code,
                timestamp: serverTimestamp(),
                status: 'completed',
                notes: `Created redeem code ${code}`
            });
            
            return {
                success: true,
                code: code,
                amount: amount,
                currency: currency
            };
            
        } catch (error) {
            console.error("Create redeem code error:", error);
            throw error;
        }
    },
    
    // Redeem code
    async redeemCode(userId, code) {
        try {
            // Get redeem code
            const redeemCodeRef = doc(db, 'redeemCodes', code);
            const redeemDoc = await getDoc(redeemCodeRef);
            
            if (!redeemDoc.exists()) {
                throw new Error("Invalid redeem code");
            }
            
            const redeemData = redeemDoc.data();
            
            // Validate code
            if (redeemData.isRedeemed) {
                throw new Error("Code already redeemed");
            }
            
            if (new Date() > redeemData.expiresAt.toDate()) {
                throw new Error("Code has expired");
            }
            
            if (redeemData.createdBy === userId) {
                throw new Error("Cannot redeem your own code");
            }
            
            // Add amount to user's balance
            await this.updateBalance(userId, redeemData.currency, redeemData.amount, 'add');
            
            // Mark code as redeemed
            await updateDoc(redeemCodeRef, {
                isRedeemed: true,
                redeemedBy: userId,
                redeemedAt: serverTimestamp(),
                status: 'redeemed'
            });
            
            // Record transaction
            const transactionRef = doc(collection(db, 'transactions'));
            await setDoc(transactionRef, {
                type: 'redeem_used',
                userId: userId,
                amount: redeemData.amount,
                currency: redeemData.currency,
                code: code,
                fromUser: redeemData.createdByUsername,
                timestamp: serverTimestamp(),
                status: 'completed',
                notes: `Redeemed code ${code}`
            });
            
            return {
                success: true,
                amount: redeemData.amount,
                currency: redeemData.currency
            };
            
        } catch (error) {
            console.error("Redeem code error:", error);
            throw error;
        }
    },
    
    // ========== UTILITY FUNCTIONS ==========
    
    // Generate CNIC
    generateCNIC() {
        const randomMiddle = Math.floor(Math.random() * 900000) + 100000;
        return `nexi@${randomMiddle.toString().padStart(6, '0')}.com`;
    },
    
    // Generate password
    generatePassword() {
        const randomNum = Math.floor(Math.random() * 900000) + 100000;
        return `${randomNum}"`;
    },
    
    // Generate redeem code
    generateRedeemCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        
        for (let i = 0; i < 16; i++) {
            if (i > 0 && i % 4 === 0) code += '-';
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        return code;
    },
    
    // Check if username exists
    async checkUsernameExists(username) {
        try {
            const q = query(
                collection(db, 'users'),
                where('username', '==', username.toLowerCase()),
                limit(1)
            );
            
            const snapshot = await getDocs(q);
            return !snapshot.empty;
        } catch (error) {
            console.error("Check username error:", error);
            throw error;
        }
    },
    
    // Check if CNIC exists
    async checkCNICExists(cnic) {
        try {
            const q = query(
                collection(db, 'users'),
                where('cnic', '==', cnic),
                limit(1)
            );
            
            const snapshot = await getDocs(q);
            return !snapshot.empty;
        } catch (error) {
            console.error("Check CNIC error:", error);
            throw error;
        }
    },
    
    // Get user by identifier (username or CNIC)
    async getUserByIdentifier(identifier) {
        try {
            // Try username
            let q = query(
                collection(db, 'users'),
                where('username', '==', identifier.toLowerCase()),
                limit(1)
            );
            
            let snapshot = await getDocs(q);
            
            if (snapshot.empty) {
                // Try CNIC
                q = query(
                    collection(db, 'users'),
                    where('cnic', '==', identifier),
                    limit(1)
                );
                snapshot = await getDocs(q);
            }
            
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                return {
                    id: doc.id,
                    ...doc.data()
                };
            }
            
            return null;
        } catch (error) {
            console.error("Get user by identifier error:", error);
            throw error;
        }
    },
    
    // Quick send from URL
    async quickSend(username, amount) {
        try {
            const user = auth.currentUser;
            if (!user) {
                throw new Error("User not authenticated");
            }
            
            return await this.sendMoney(user.uid, username, parseFloat(amount), 'USD');
        } catch (error) {
            console.error("Quick send error:", error);
            throw error;
        }
    },
    
    // Get exchange rate (USD to RON)
    getExchangeRate() {
        return 0.56; // 1 USD = 0.56 RON
    },
    
    // Convert currency
    convertCurrency(amount, fromCurrency, toCurrency) {
        const rates = {
            'USD': { 'RON': 0.56 },
            'RON': { 'USD': 1.7857 } // 1/0.56
        };
        
        if (fromCurrency === toCurrency) return amount;
        
        const rate = rates[fromCurrency]?.[toCurrency];
        if (!rate) throw new Error("Unsupported currency conversion");
        
        return amount * rate;
    },
    
    // Logout user
    async logout() {
        try {
            await signOut(auth);
            return { success: true };
        } catch (error) {
            console.error("Logout error:", error);
            throw error;
        }
    }
};

// Initialize Firebase services
export const initFirebase = () => {
    console.log("Firebase initialized");
    return { auth, db, FirebaseService };
};

// Make available globally for HTML files
if (typeof window !== 'undefined') {
    window.FirebaseService = FirebaseService;
    window.firebaseAuth = auth;
    window.firebaseDb = db;
}

export default initFirebase;