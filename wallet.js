// Firebase Configuration - REAL CONFIG FROM YOUR FILE
const firebaseConfig = {
    apiKey: "AIzaSyCjEaeM-LccF69A84ppSfbP-vhVKInCQyM", // You need to get this from Firebase Console
    authDomain: "ejene-d8ff7.firebaseapp.com",
    projectId: "ejene-d8ff7", // Your project ID
    storageBucket: "ejene-d8ff7.firebasestorage.app",
    messagingSenderId: "612166184659", // From your config
    appId: "1:612166184659:web:f8642069f141bb219b6e26" // You need to get this
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global variables
let currentUser = null;
let userData = null;
const EXCHANGE_RATE = 0.56; // 1 USD = 0.56 RON
const ADMIN_EMAIL = "firebase-adminsdk-fbsvc@ejene-d8ff7.iam.gserviceaccount.com";

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    checkAuthState();
    setupEventListeners();
    checkUrlParams();
    
    // Auto-generate CNIC and password on register page load
    document.getElementById('reg-cnic').addEventListener('focus', function() {
        if (!this.value) {
            generateAndDisplayCredentials();
        }
    });
});

// Check URL parameters for quick send
function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get('username');
    const sendAmount = urlParams.get('send');
    
    if (username && sendAmount && !isNaN(parseFloat(sendAmount)) && parseFloat(sendAmount) > 0) {
        sessionStorage.setItem('pendingQuickSend', JSON.stringify({
            receiver: username,
            amount: parseFloat(sendAmount)
        }));
        alert(`Quick send detected: ${sendAmount} to ${username}. Please login first.`);
    }
}

// Setup event listeners
function setupEventListeners() {
    // USD to RON converter
    document.getElementById('usd-input').addEventListener('input', convertUSDToRON);
    
    // Register form auto-fill
    document.getElementById('reg-username').addEventListener('input', function() {
        if (this.value && !document.getElementById('reg-cnic').value) {
            generateAndDisplayCredentials();
        }
    });
}

// Convert USD to RON
function convertUSDToRON() {
    const usdInput = document.getElementById('usd-input');
    const ronOutput = document.getElementById('ron-output');
    
    const usdValue = parseFloat(usdInput.value) || 0;
    const ronValue = usdValue * EXCHANGE_RATE;
    ronOutput.value = ronValue.toFixed(2);
}

// Generate CNIC in format: nexi@020929.com
function generateCNIC() {
    const randomMiddle = Math.floor(Math.random() * 900000) + 100000; // 6 digit random
    const timestamp = Date.now().toString().slice(-6);
    const middle = randomMiddle.toString().padStart(6, '0');
    return `nexi@${middle}.com`;
}

// Generate Password: 6 digits + "
function generatePassword() {
    const randomNum = Math.floor(Math.random() * 900000) + 100000; // 6 digits
    return `${randomNum}"`;
}

// Generate and display credentials
function generateAndDisplayCredentials() {
    const cnic = generateCNIC();
    const password = generatePassword();
    
    document.getElementById('reg-cnic').value = cnic;
    document.getElementById('display-cnic').textContent = cnic;
    document.getElementById('display-password').textContent = password;
}

// Show Register Form
function showRegister() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
    generateAndDisplayCredentials();
}

// Show Login Form
function showLogin() {
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
}

// Register User
async function register() {
    const cnic = document.getElementById('reg-cnic').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('display-password').textContent;
    
    if (!username) {
        alert('Please enter a username');
        return;
    }
    
    if (!cnic || !cnic.includes('@') || !cnic.includes('.com')) {
        alert('Invalid CNIC format');
        return;
    }
    
    // Check if username already exists
    const usernameSnapshot = await db.collection('users')
        .where('username', '==', username)
        .get();
    
    if (!usernameSnapshot.empty) {
        alert('Username already exists. Please choose another.');
        return;
    }
    
    // Check if CNIC already exists
    const cnicSnapshot = await db.collection('users')
        .where('cnic', '==', cnic)
        .get();
    
    if (!cnicSnapshot.empty) {
        alert('CNIC already registered. Please login.');
        showLogin();
        return;
    }
    
    try {
        // Create user in Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(cnic, password);
        const user = userCredential.user;
        
        // Create user document in Firestore
        await db.collection('users').doc(user.uid).set({
            uid: user.uid,
            cnic: cnic,
            username: username.toLowerCase(),
            password: password,
            usdBalance: 0.00,
            ronBalance: 0.00,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Create wallet document
        await db.collection('wallets').doc(user.uid).set({
            userId: user.uid,
            transactions: [],
            totalSent: 0,
            totalReceived: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        alert('Registration successful! Your CNIC: ' + cnic + '\nPassword: ' + password + '\n\nPlease save these credentials.');
        showLogin();
        
    } catch (error) {
        console.error('Registration error:', error);
        alert('Error: ' + error.message);
    }
}

// Login User
async function login() {
    const cnic = document.getElementById('login-cnic').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!cnic || !password) {
        alert('Please enter CNIC and password');
        return;
    }
    
    try {
        const userCredential = await auth.signInWithEmailAndPassword(cnic, password);
        currentUser = userCredential.user;
        
        // Update last login time
        await db.collection('users').doc(currentUser.uid).update({
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Load user data
        await loadUserData();
        showDashboard();
        
        // Check for pending quick send
        checkPendingQuickSend();
        
    } catch (error) {
        console.error('Login error:', error);
        
        if (error.code === 'auth/user-not-found') {
            alert('User not found. Please register first.');
            showRegister();
        } else if (error.code === 'auth/wrong-password') {
            alert('Incorrect password. Please try again.');
        } else {
            alert('Login failed: ' + error.message);
        }
    }
}

// Load User Data
async function loadUserData() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        
        if (userDoc.exists) {
            userData = userDoc.data();
            
            // Update UI
            document.getElementById('welcome-text').textContent = `Welcome, ${userData.username}`;
            document.getElementById('usd-balance').textContent = `$${userData.usdBalance.toFixed(2)}`;
            document.getElementById('ron-balance').textContent = `${userData.ronBalance.toFixed(2)} RON`;
            document.getElementById('user-cnic').textContent = userData.cnic;
            document.getElementById('user-username').textContent = userData.username;
            document.getElementById('user-password').dataset.actual = userData.password;
            
            // Reset forms
            resetForms();
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Check Authentication State
function checkAuthState() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData();
            showDashboard();
        } else {
            showAuth();
        }
    });
}

// Show Dashboard
function showDashboard() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
}

// Show Auth Section
function showAuth() {
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
}

// Logout
function logout() {
    auth.signOut();
    currentUser = null;
    userData = null;
    showAuth();
}

// Toggle Password Visibility
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.parentElement.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Toggle User Password Visibility
function toggleUserPassword() {
    const passwordSpan = document.getElementById('user-password');
    const icon = passwordSpan.nextElementSibling.querySelector('i');
    const actualPassword = passwordSpan.dataset.actual;
    
    if (passwordSpan.textContent === '••••••••') {
        passwordSpan.textContent = actualPassword;
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        passwordSpan.textContent = '••••••••';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Show Send Form
function showSendForm() {
    hideAllForms();
    document.getElementById('send-form').classList.remove('hidden');
}

// Show Deposit Options
function showDepositForm() {
    hideAllForms();
    document.getElementById('deposit-form').classList.remove('hidden');
}

// Show Create Redeem Code Form
function showCreateRedeem() {
    hideAllForms();
    document.getElementById('create-redeem-form').classList.remove('hidden');
}

// Show Redeem Code Form
function showRedeemCode() {
    hideAllForms();
    document.getElementById('redeem-code-form').classList.remove('hidden');
}

// Hide all forms
function hideAllForms() {
    const forms = [
        'send-form',
        'deposit-form', 
        'create-redeem-form',
        'redeem-code-form'
    ];
    
    forms.forEach(formId => {
        document.getElementById(formId).classList.add('hidden');
    });
}

// Reset forms
function resetForms() {
    document.getElementById('receiver').value = '';
    document.getElementById('send-amount').value = '';
    document.getElementById('send-currency').value = 'USD';
    document.getElementById('redeem-amount').value = '';
    document.getElementById('redeem-currency').value = 'USD';
    document.getElementById('generated-code').value = '';
    document.getElementById('code-input').value = '';
    document.getElementById('usd-input').value = '';
    document.getElementById('ron-output').value = '';
    hideAllForms();
}

// Send Money
async function sendMoney() {
    const receiverInput = document.getElementById('receiver').value.trim();
    const amount = parseFloat(document.getElementById('send-amount').value);
    const currency = document.getElementById('send-currency').value;
    
    if (!receiverInput || !amount || amount <= 0) {
        alert('Please enter valid receiver and amount');
        return;
    }
    
    if (isNaN(amount)) {
        alert('Please enter a valid amount');
        return;
    }
    
    // Check sender balance
    const balanceKey = currency.toLowerCase() + 'Balance';
    if (userData[balanceKey] < amount) {
        alert(`Insufficient ${currency} balance. You have ${userData[balanceKey].toFixed(2)} ${currency}`);
        return;
    }
    
    try {
        // Find receiver by username or CNIC
        let receiverSnapshot = await db.collection('users')
            .where('username', '==', receiverInput.toLowerCase())
            .get();
        
        if (receiverSnapshot.empty) {
            receiverSnapshot = await db.collection('users')
                .where('cnic', '==', receiverInput)
                .get();
        }
        
        if (receiverSnapshot.empty) {
            alert('Receiver not found. Check username or CNIC.');
            return;
        }
        
        const receiverDoc = receiverSnapshot.docs[0];
        const receiverData = receiverDoc.data();
        
        if (receiverData.uid === currentUser.uid) {
            alert('Cannot send money to yourself');
            return;
        }
        
        // Create transaction record
        const transactionId = 'TXN' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
        const transaction = {
            id: transactionId,
            senderId: currentUser.uid,
            senderUsername: userData.username,
            receiverId: receiverData.uid,
            receiverUsername: receiverData.username,
            amount: amount,
            currency: currency,
            timestamp: new Date().toISOString(),
            status: 'completed'
        };
        
        // Perform transaction in a batch to ensure atomicity
        const batch = db.batch();
        
        // Deduct from sender
        const senderRef = db.collection('users').doc(currentUser.uid);
        batch.update(senderRef, {
            [balanceKey]: userData[balanceKey] - amount
        });
        
        // Add to receiver
        const receiverRef = db.collection('users').doc(receiverData.uid);
        const receiverBalance = receiverData[balanceKey] || 0;
        batch.update(receiverRef, {
            [balanceKey]: receiverBalance + amount
        });
        
        // Add transaction to sender's wallet
        const senderWalletRef = db.collection('wallets').doc(currentUser.uid);
        batch.update(senderWalletRef, {
            transactions: firebase.firestore.FieldValue.arrayUnion({
                ...transaction,
                type: 'sent'
            }),
            totalSent: firebase.firestore.FieldValue.increment(amount)
        });
        
        // Add transaction to receiver's wallet
        const receiverWalletRef = db.collection('wallets').doc(receiverData.uid);
        batch.update(receiverWalletRef, {
            transactions: firebase.firestore.FieldValue.arrayUnion({
                ...transaction,
                type: 'received'
            }),
            totalReceived: firebase.firestore.FieldValue.increment(amount)
        });
        
        // Commit batch
        await batch.commit();
        
        // Show success message with transaction details
        showTransactionModal(transaction);
        
        // Reload user data
        await loadUserData();
        
        // Reset form
        hideAllForms();
        
    } catch (error) {
        console.error('Send money error:', error);
        alert('Transaction failed: ' + error.message);
    }
}

// Generate Redeem Code
async function generateRedeemCode() {
    const amount = parseFloat(document.getElementById('redeem-amount').value);
    const currency = document.getElementById('redeem-currency').value;
    
    if (!amount || amount <= 0) {
        alert('Please enter valid amount');
        return;
    }
    
    // Check balance
    const balanceKey = currency.toLowerCase() + 'Balance';
    if (userData[balanceKey] < amount) {
        alert(`Insufficient ${currency} balance`);
        return;
    }
    
    try {
        // Generate unique code (format: XXXX-XXXX-XXXX-XXXX)
        const code = generateUniqueCode();
        
        // Deduct amount from user's balance
        await db.collection('users').doc(currentUser.uid).update({
            [balanceKey]: userData[balanceKey] - amount
        });
        
        // Create redeem code document
        const redeemData = {
            code: code,
            amount: amount,
            currency: currency,
            createdBy: currentUser.uid,
            createdByUsername: userData.username,
            createdAt: new Date().toISOString(),
            isRedeemed: false,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
        };
        
        await db.collection('redeemCodes').doc(code).set(redeemData);
        
        // Add to user's transaction history
        const transaction = {
            id: 'RDM' + Date.now(),
            type: 'redeem_created',
            code: code,
            amount: amount,
            currency: currency,
            timestamp: new Date().toISOString()
        };
        
        await db.collection('wallets').doc(currentUser.uid).update({
            transactions: firebase.firestore.FieldValue.arrayUnion(transaction)
        });
        
        // Display generated code
        document.getElementById('generated-code').value = code;
        
        alert(`Redeem code created successfully!\n\nCode: ${code}\nAmount: ${amount} ${currency}\n\nShare this code with anyone to redeem.`);
        
        // Reload user data
        await loadUserData();
        
    } catch (error) {
        console.error('Generate redeem code error:', error);
        alert('Failed to generate code: ' + error.message);
    }
}

// Generate unique redeem code
function generateUniqueCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    
    for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) {
            code += '-';
        }
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return code;
}

// Redeem Code
async function redeemCode() {
    const code = document.getElementById('code-input').value.trim().toUpperCase();
    
    if (!code) {
        alert('Please enter redeem code');
        return;
    }
    
    // Validate code format (XXXX-XXXX-XXXX-XXXX)
    const codeRegex = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!codeRegex.test(code)) {
        alert('Invalid code format. Format should be XXXX-XXXX-XXXX-XXXX');
        return;
    }
    
    try {
        // Get redeem code
        const codeDoc = await db.collection('redeemCodes').doc(code).get();
        
        if (!codeDoc.exists) {
            alert('Invalid redeem code');
            return;
        }
        
        const codeData = codeDoc.data();
        
        // Check if already redeemed
        if (codeData.isRedeemed) {
            alert('This code has already been redeemed');
            return;
        }
        
        // Check if expired
        if (new Date() > new Date(codeData.expiresAt)) {
            alert('This code has expired');
            return;
        }
        
        // Check if user is trying to redeem their own code
        if (codeData.createdBy === currentUser.uid) {
            alert('Cannot redeem your own code');
            return;
        }
        
        // Add amount to user's balance
        const balanceKey = codeData.currency.toLowerCase() + 'Balance';
        const newBalance = userData[balanceKey] + codeData.amount;
        
        // Update user balance
        await db.collection('users').doc(currentUser.uid).update({
            [balanceKey]: newBalance
        });
        
        // Mark code as redeemed
        await db.collection('redeemCodes').doc(code).update({
            isRedeemed: true,
            redeemedBy: currentUser.uid,
            redeemedByUsername: userData.username,
            redeemedAt: new Date().toISOString()
        });
        
        // Add transaction record
        const transaction = {
            id: 'REDEEM' + Date.now(),
            type: 'redeem_used',
            code: code,
            amount: codeData.amount,
            currency: codeData.currency,
            fromUser: codeData.createdByUsername,
            timestamp: new Date().toISOString()
        };
        
        await db.collection('wallets').doc(currentUser.uid).update({
            transactions: firebase.firestore.FieldValue.arrayUnion(transaction)
        });
        
        alert(`Successfully redeemed ${codeData.amount} ${codeData.currency}!`);
        
        // Reload user data
        await loadUserData();
        
        // Reset form
        hideAllForms();
        
    } catch (error) {
        console.error('Redeem code error:', error);
        alert('Failed to redeem code: ' + error.message);
    }
}

// Show Transaction Modal
function showTransactionModal(transaction) {
    const modal = document.getElementById('transaction-modal');
    const detailsDiv = document.getElementById('transaction-details');
    
    detailsDiv.innerHTML = `
        <h4>Transaction Successful!</h4>
        <p><strong>Transaction ID:</strong> ${transaction.id}</p>
        <p><strong>From:</strong> ${transaction.senderUsername}</p>
        <p><strong>To:</strong> ${transaction.receiverUsername}</p>
        <p><strong>Amount:</strong> ${transaction.amount} ${transaction.currency}</p>
        <p><strong>Time:</strong> ${new Date(transaction.timestamp).toLocaleString()}</p>
        <p><strong>Status:</strong> <span style="color: green;">✓ Completed</span></p>
    `;
    
    modal.style.display = 'flex';
}

// Close Modal
function closeModal() {
    document.getElementById('transaction-modal').style.display = 'none';
}

// Check for pending quick send
async function checkPendingQuickSend() {
    const pending = sessionStorage.getItem('pendingQuickSend');
    
    if (pending) {
        try {
            const { receiver, amount } = JSON.parse(pending);
            sessionStorage.removeItem('pendingQuickSend');
            
            // Auto-fill send form
            document.getElementById('receiver').value = receiver;
            document.getElementById('send-amount').value = amount;
            showSendForm();
            
            // Ask user to confirm
            setTimeout(() => {
                if (confirm(`Quick send detected:\nSend ${amount} to ${receiver}?\n\nClick OK to proceed.`)) {
                    sendMoney();
                }
            }, 1000);
            
        } catch (error) {
            console.error('Quick send error:', error);
        }
    }
}

// Handle quick send from URL
window.handleQuickSend = async function(username, amount) {
    if (!currentUser) {
        sessionStorage.setItem('pendingQuickSend', JSON.stringify({ receiver: username, amount: amount }));
        alert('Please login first to send money.');
        return;
    }
    
    document.getElementById('receiver').value = username;
    document.getElementById('send-amount').value = amount;
    showSendForm();
    
    if (confirm(`Send ${amount} to ${username}?`)) {
        await sendMoney();
    }
};

// Export functions for global access
window.showRegister = showRegister;
window.showLogin = showLogin;
window.register = register;
window.login = login;
window.logout = logout;
window.togglePassword = togglePassword;
window.toggleUserPassword = toggleUserPassword;
window.showSendForm = showSendForm;
window.showDepositForm = showDepositForm;
window.showCreateRedeem = showCreateRedeem;
window.showRedeemCode = showRedeemCode;
window.sendMoney = sendMoney;
window.generateRedeemCode = generateRedeemCode;
window.redeemCode = redeemCode;
window.closeModal = closeModal;

// Auto-convert on USD input
document.getElementById('usd-input').addEventListener('input', function() {
    const usd = parseFloat(this.value) || 0;
    const ron = usd * EXCHANGE_RATE;
    document.getElementById('ron-output').value = ron.toFixed(2);
});

// Initialize on page load
window.onload = function() {
    // Check if there's a quick send in URL
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get('username');
    const sendAmount = urlParams.get('send');
    
    if (username && sendAmount) {
        handleQuickSend(username, parseFloat(sendAmount));
    }
};