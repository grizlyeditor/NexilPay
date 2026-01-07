// Firebase Authentication Module
class AuthSystem {
    constructor() {
        this.currentUser = null;
        this.userData = null;
        this.isInitialized = false;
        this.authListeners = [];
        
        // Initialize Firebase if not already initialized
        if (!firebase.apps.length) {
            this.initializeFirebase();
        } else {
            this.isInitialized = true;
            this.setupAuth();
        }
    }

    // Initialize Firebase
    initializeFirebase() {
        try {
            // Your Firebase Configuration
            const firebaseConfig = {
                apiKey: "AIzaSyCjEaeM-LccF69A84ppSfbP-vhVKInCQyM", // Replace with your actual API key
                authDomain: "ejene-d8ff7.firebaseapp.com",
                projectId: "ejene-d8ff7",
                storageBucket: "ejene-d8ff7.firebasestorage.app",
                messagingSenderId: "612166184659",
                appId: "1:612166184659:web:f8642069f141bb219b6e26" // Replace with your app ID
            };

            firebase.initializeApp(firebaseConfig);
            this.isInitialized = true;
            console.log("Firebase initialized successfully");
            this.setupAuth();
        } catch (error) {
            console.error("Firebase initialization error:", error);
            throw error;
        }
    }

    // Setup authentication listeners
    setupAuth() {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                console.log("User logged in:", user.email);
                this.currentUser = user;
                await this.loadUserData();
                this.notifyAuthChange(true);
            } else {
                console.log("User logged out");
                this.currentUser = null;
                this.userData = null;
                this.notifyAuthChange(false);
            }
        });
    }

    // Register a new user
    async register(username, cnic, password) {
        try {
            console.log("Starting registration for:", username);
            
            // Validate inputs
            if (!username || !cnic || !password) {
                throw new Error("All fields are required");
            }

            if (username.length < 3) {
                throw new Error("Username must be at least 3 characters");
            }

            // Validate CNIC format
            if (!this.validateCNIC(cnic)) {
                throw new Error("Invalid CNIC format. Must be like: nexi@020929.com");
            }

            // Check if username already exists
            const usernameExists = await this.checkUsernameExists(username);
            if (usernameExists) {
                throw new Error("Username already exists");
            }

            // Check if CNIC already exists
            const cnicExists = await this.checkCNICExists(cnic);
            if (cnicExists) {
                throw new Error("CNIC already registered. Please login.");
            }

            // Create user in Firebase Authentication
            const userCredential = await firebase.auth().createUserWithEmailAndPassword(cnic, password);
            const user = userCredential.user;
            
            console.log("Firebase user created:", user.uid);

            // Create user document in Firestore
            await this.createUserDocument(user.uid, username, cnic, password);
            
            // Create wallet for user
            await this.createWalletDocument(user.uid);
            
            console.log("Registration successful for:", username);
            
            return {
                success: true,
                user: user,
                cnic: cnic,
                password: password
            };

        } catch (error) {
            console.error("Registration error:", error);
            
            // Handle specific Firebase errors
            let errorMessage = error.message;
            
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "CNIC already registered. Please login.";
            } else if (error.code === 'auth/weak-password') {
                errorMessage = "Password is too weak. Use stronger password.";
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = "Invalid CNIC format.";
            }
            
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    // Login user
    async login(cnic, password) {
        try {
            console.log("Login attempt for CNIC:", cnic);
            
            if (!cnic || !password) {
                throw new Error("Please enter CNIC and password");
            }

            const userCredential = await firebase.auth().signInWithEmailAndPassword(cnic, password);
            const user = userCredential.user;
            
            console.log("Login successful for:", user.email);
            
            // Update last login time
            await this.updateLastLogin(user.uid);
            
            return {
                success: true,
                user: user
            };

        } catch (error) {
            console.error("Login error:", error);
            
            let errorMessage = "Login failed";
            
            if (error.code === 'auth/user-not-found') {
                errorMessage = "User not found. Please register first.";
            } else if (error.code === 'auth/wrong-password') {
                errorMessage = "Incorrect password. Please try again.";
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = "Invalid CNIC format.";
            } else if (error.code === 'auth/user-disabled') {
                errorMessage = "Account has been disabled.";
            } else if (error.code === 'auth/too-many-requests') {
                errorMessage = "Too many attempts. Try again later.";
            }
            
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    // Logout user
    async logout() {
        try {
            await firebase.auth().signOut();
            console.log("User logged out");
            return { success: true };
        } catch (error) {
            console.error("Logout error:", error);
            return { 
                success: false, 
                error: "Logout failed: " + error.message 
            };
        }
    }

    // Load user data from Firestore
    async loadUserData() {
        if (!this.currentUser) return null;

        try {
            const userDoc = await firebase.firestore()
                .collection('users')
                .doc(this.currentUser.uid)
                .get();

            if (userDoc.exists) {
                this.userData = userDoc.data();
                console.log("User data loaded:", this.userData.username);
                return this.userData;
            } else {
                console.warn("User document not found");
                return null;
            }
        } catch (error) {
            console.error("Error loading user data:", error);
            return null;
        }
    }

    // Check if username exists
    async checkUsernameExists(username) {
        try {
            const snapshot = await firebase.firestore()
                .collection('users')
                .where('username', '==', username.toLowerCase())
                .limit(1)
                .get();

            return !snapshot.empty;
        } catch (error) {
            console.error("Error checking username:", error);
            return false;
        }
    }

    // Check if CNIC exists
    async checkCNICExists(cnic) {
        try {
            const snapshot = await firebase.firestore()
                .collection('users')
                .where('cnic', '==', cnic)
                .limit(1)
                .get();

            return !snapshot.empty;
        } catch (error) {
            console.error("Error checking CNIC:", error);
            return false;
        }
    }

    // Validate CNIC format
    validateCNIC(cnic) {
        // Format: nexi@020929.com
        const cnicRegex = /^nexi@\d{6}\.com$/;
        return cnicRegex.test(cnic);
    }

    // Generate CNIC
    generateCNIC() {
        const randomNumbers = Math.floor(Math.random() * 900000) + 100000; // 6 digits
        return `nexi@${randomNumbers}.com`;
    }

    // Generate password
    generatePassword() {
        const randomNumbers = Math.floor(Math.random() * 900000) + 100000; // 6 digits
        return `${randomNumbers}"`;
    }

    // Create user document in Firestore
    async createUserDocument(userId, username, cnic, password) {
        try {
            const userData = {
                uid: userId,
                username: username.toLowerCase(),
                cnic: cnic,
                password: password,
                usdBalance: 0.00,
                ronBalance: 0.00,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active',
                accountType: 'user'
            };

            await firebase.firestore()
                .collection('users')
                .doc(userId)
                .set(userData);

            console.log("User document created for:", username);
            return true;
        } catch (error) {
            console.error("Error creating user document:", error);
            throw error;
        }
    }

    // Create wallet document
    async createWalletDocument(userId) {
        try {
            const walletData = {
                userId: userId,
                transactions: [],
                totalSent: 0,
                totalReceived: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };

            await firebase.firestore()
                .collection('wallets')
                .doc(userId)
                .set(walletData);

            console.log("Wallet document created for user:", userId);
            return true;
        } catch (error) {
            console.error("Error creating wallet document:", error);
            throw error;
        }
    }

    // Update last login time
    async updateLastLogin(userId) {
        try {
            await firebase.firestore()
                .collection('users')
                .doc(userId)
                .update({
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                });
            return true;
        } catch (error) {
            console.error("Error updating last login:", error);
            return false;
        }
    }

    // Get current user data
    getUserData() {
        return this.userData;
    }

    // Get current user
    getCurrentUser() {
        return this.currentUser;
    }

    // Check if user is authenticated
    isAuthenticated() {
        return this.currentUser !== null;
    }

    // Add authentication change listener
    addAuthListener(callback) {
        this.authListeners.push(callback);
    }

    // Remove authentication change listener
    removeAuthListener(callback) {
        this.authListeners = this.authListeners.filter(listener => listener !== callback);
    }

    // Notify all listeners about auth change
    notifyAuthChange(isAuthenticated) {
        this.authListeners.forEach(listener => {
            try {
                listener(isAuthenticated, this.userData);
            } catch (error) {
                console.error("Error in auth listener:", error);
            }
        });
    }

    // Get user by username or CNIC
    async getUserByIdentifier(identifier) {
        try {
            // Try username first
            let snapshot = await firebase.firestore()
                .collection('users')
                .where('username', '==', identifier.toLowerCase())
                .limit(1)
                .get();

            if (snapshot.empty) {
                // Try CNIC
                snapshot = await firebase.firestore()
                    .collection('users')
                    .where('cnic', '==', identifier)
                    .limit(1)
                    .get();
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
            console.error("Error getting user:", error);
            return null;
        }
    }

    // Update user balance
    async updateUserBalance(userId, currency, amount, operation = 'add') {
        try {
            const userRef = firebase.firestore().collection('users').doc(userId);
            const field = currency.toLowerCase() + 'Balance';
            
            if (operation === 'add') {
                await userRef.update({
                    [field]: firebase.firestore.FieldValue.increment(amount)
                });
            } else if (operation === 'subtract') {
                await userRef.update({
                    [field]: firebase.firestore.FieldValue.increment(-amount)
                });
            }
            
            return true;
        } catch (error) {
            console.error("Error updating balance:", error);
            throw error;
        }
    }

    // Get user's balance
    async getUserBalance(userId, currency) {
        try {
            const userDoc = await firebase.firestore()
                .collection('users')
                .doc(userId)
                .get();

            if (userDoc.exists) {
                const data = userDoc.data();
                const field = currency.toLowerCase() + 'Balance';
                return data[field] || 0;
            }
            
            return 0;
        } catch (error) {
            console.error("Error getting balance:", error);
            return 0;
        }
    }

    // Reset password (if needed)
    async resetPassword(cnic) {
        try {
            await firebase.auth().sendPasswordResetEmail(cnic);
            return {
                success: true,
                message: "Password reset email sent to your CNIC"
            };
        } catch (error) {
            console.error("Password reset error:", error);
            return {
                success: false,
                error: "Failed to send reset email. Check your CNIC."
            };
        }
    }

    // Check if Firebase is ready
    isReady() {
        return this.isInitialized;
    }

    // Initialize the auth system
    init() {
        if (!this.isInitialized) {
            this.initializeFirebase();
        }
        return this;
    }
}

// Create global instance
const authSystem = new AuthSystem();

// Export for use in other files
window.AuthSystem = AuthSystem;
window.authSystem = authSystem;

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded, initializing auth system...");
    
    // Check if Firebase is available
    if (typeof firebase === 'undefined') {
        console.error("Firebase is not loaded!");
        return;
    }
    
    // Initialize auth system
    authSystem.init();
    
    // Check authentication state
    setTimeout(() => {
        if (authSystem.isAuthenticated()) {
            console.log("User is already authenticated");
            // You can trigger dashboard show here if needed
            if (window.showDashboard) {
                window.showDashboard();
            }
        } else {
            console.log("User is not authenticated");
        }
    }, 1000);
});

// Utility functions for UI
function generateAndDisplayRegistrationCredentials() {
    const cnic = authSystem.generateCNIC();
    const password = authSystem.generatePassword();
    
    return { cnic, password };
}

function validateRegistrationForm(username, cnic) {
    const errors = [];
    
    if (!username || username.length < 3) {
        errors.push("Username must be at least 3 characters");
    }
    
    if (!cnic || !authSystem.validateCNIC(cnic)) {
        errors.push("Invalid CNIC format. Must be like: nexi@020929.com");
    }
    
    return errors;
}

// Example usage in your HTML:
/*
// Register user
const { cnic, password } = generateAndDisplayRegistrationCredentials();
document.getElementById('reg-cnic').value = cnic;
document.getElementById('display-password').textContent = password;

// When register button is clicked:
async function handleRegister() {
    const username = document.getElementById('reg-username').value;
    const cnic = document.getElementById('reg-cnic').value;
    const password = document.getElementById('display-password').textContent;
    
    const result = await authSystem.register(username, cnic, password);
    if (result.success) {
        alert("Registration successful!");
        // Show login form or auto-login
    } else {
        alert("Error: " + result.error);
    }
}

// When login button is clicked:
async function handleLogin() {
    const cnic = document.getElementById('login-cnic').value;
    const password = document.getElementById('login-password').value;
    
    const result = await authSystem.login(cnic, password);
    if (result.success) {
        // Show dashboard
        showDashboard();
    } else {
        alert("Login failed: " + result.error);
    }
}

// Check auth state
authSystem.addAuthListener((isAuthenticated, userData) => {
    if (isAuthenticated) {
        console.log("User authenticated:", userData.username);
        // Update UI with user data
        updateUIWithUserData(userData);
    } else {
        console.log("User not authenticated");
        // Show login screen
        showLoginScreen();
    }
});
*/

console.log("Auth system loaded successfully");