const puppeteer = require('puppeteer');
const qrcode = require('qrcode-terminal');
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai")

const startWhatsAppBot = async () => {
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        userDataDir: './whatsapp-session'  // Session data stored here
    });
    const page = await browser.newPage();
    
    await page.goto('https://web.whatsapp.com/');
    console.log('Please scan the QR code to connect to WhatsApp Web.');

    try {
        // Increase the wait time to 60 seconds to give WhatsApp Web more time to load the QR code
        await page.waitForSelector('._akau"]', { timeout: 60000 });

        // Capture and print QR code if it appears
        const qrCodeDataUrl = await page.evaluate(() => {
            const canvas = document.querySelector('._akau');
            return canvas.toDataURL();
        });

        const base64QRCode = qrCodeDataUrl.split(',')[1];
        qrcode.generate(base64QRCode, { small: true });

        console.log('QR Code generated. Please scan it using WhatsApp.');
    } catch (err) {
        console.log('It seems there is already an active session, or the QR code took too long to load.');
    }

    // Wait until the user is logged in
    await page.waitForSelector('.x1n2onr6', { timeout: 0 });  // Adjust selector based on UI changes
    console.log('Logged in successfully.');

    // Start polling for new messages in unopened chats
    await pollForNewChats(page);
};

const lastMessages = {}; // Object to store last processed messages by chat ID

const pollForNewChats = async (page) => {
    console.log('Polling for new chats...');

    setInterval(async () => {
        try {
            // Selector to find chats with unread messages
            const unreadChatSelector = 'div[role="listitem"][style*="translateY(0px)"]';
            const unreadChat = await page.$(unreadChatSelector);

            if (unreadChat) {
                console.log('New message in unopened chat detected.');

                // Get the parent list item of the unread chat
                const chatItemHandle = await unreadChat.evaluateHandle(el => el.closest('div[role="listitem"]'));
                const chatId = await chatItemHandle.evaluate(el => el.getAttribute('data-id')); // Assuming there's a way to get a unique chat ID

                if (chatItemHandle) {
                    console.log('Chat item found, clicking to open the chat.');
                    await chatItemHandle.click(); // Click to open the chat

                    // Wait for the chat to load and detect the last message
                    await page.waitForSelector('.message-in .selectable-text span');
                    const newMessage = await page.evaluate(() => {
                        const messageElems = document.querySelectorAll('.message-in .selectable-text span');
                        return messageElems[messageElems.length - 1].textContent;
                    });

                    // Check if the message is new for this chat
                    if (newMessage && newMessage !== lastMessages[chatId]) {
                        console.log('New message:', newMessage);
                        lastMessages[chatId] = newMessage; // Update the last message for this chat

                        // Respond to the new message
                        await handleMessage(newMessage, page);

                        // Close the chat and go back to the chat list
                        await goBackToChatList(page);
                    } else {
                        console.log('No new messages to respond to.');
                    }
                } else {
                    console.log('Chat item handle is undefined. Could not click the chat.');
                }
            } else {
                console.log('No new messages in unopened chats.');
            }
        } catch (err) {
            console.error('Error detecting new chats:', err);
        }
    }, 5000); // Poll every 5 seconds (adjustable)
};

// Function to handle closing the chat and going back to the chat list
const goBackToChatList = async (page) => {
    const backButtonSelector = 'div[role="listitem"][style*="translateY(0px)"]'; // WhatsApp Web back button selector
    try {
        await page.waitForSelector(backButtonSelector);
        await page.click(backButtonSelector); // Click the back button to return to the chat list
        console.log('Returned to the chat list.');
    } catch (err) {
        console.error('Error returning to the chat list:', err);
    }
};

const handleMessage = async (message, page) => {
    const response = await generateAIResponse(message);

    if (typeof response !== 'string' || response.trim() === '') {
        console.error('Invalid response text:', response);
        return;
    }

    // Type the response into the message box
    const inputSelector = 'footer div[contenteditable="true"]';

    try {
        await page.waitForSelector(inputSelector);

        // Clear the message box before typing (optional, but might be helpful to avoid previous message interference)
        await page.evaluate((selector) => {
            const inputBox = document.querySelector(selector);
            if (inputBox) inputBox.innerHTML = '';
        }, inputSelector);

        // Type the response
        await page.type(inputSelector, response);

        // Send the response by simulating pressing 'Enter'
        await page.keyboard.press('Enter');

        console.log('Response sent:', response);
    } catch (err) {
        console.error('Error sending response:', err);
    }
};



const generateResponse = (message) => {
    if (typeof message === 'string' && message.toLowerCase().includes('hi')) {
        return 'Hello there! Lelo here, how can I help you?';
    }

    return "I'm not sure how to respond to that.";
};


const API_KEY = process.env.API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const generateAIResponse = async (message) => {
    try {
        const completion = await model.generateContent(message);
        const aiResponse = completion.response.text();
       if (aiResponse) {
        return aiResponse;
       } else {
       return 'There is still an issue';
    }
    } catch (err) {
        console.error('Failed to generate response: ', err);
    }
}; 

startWhatsAppBot();
