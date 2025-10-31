const { GoogleGenerativeAI } = require("@google/generative-ai");
const { chromium } = require('playwright');
const fs = require('fs').promises;
require('dotenv').config();

if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY not found!");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

class GeminiComputerUse {
    constructor() {
        this.browser = null;
        this.page = null;
        this.model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-computer-use-preview-10-2025" 
        });
        console.log("🖥️  Using Gemini 2.5 Computer Use Preview model");
    }

    async initialize() {
        this.browser = await chromium.launch({ 
            headless: false,
            args: ['--start-maximized']
        });
        this.page = await this.browser.newPage();
        console.log("✅ Browser initialized");
    }

    async captureScreenshot() {
        const screenshot = await this.page.screenshot({ 
            encoding: 'base64',
            fullPage: false 
        });
        return screenshot;
    }

    async executeAction(action) {
        try {
            switch (action.type) {
                case 'click':
                    await this.page.click(`[data-testid="${action.selector}"]`, {
                        position: { x: action.x, y: action.y }
                    });
                    break;
                    
                case 'type':
                    await this.page.type(action.selector, action.text);
                    break;
                    
                case 'navigate':
                    await this.page.goto(action.url);
                    break;
                    
                case 'wait':
                    await this.page.waitForTimeout(action.duration || 1000);
                    break;
                    
                case 'scroll':
                    await this.page.evaluate((y) => window.scrollTo(0, y), action.y);
                    break;
                    
                default:
                    console.log(`Unknown action: ${action.type}`);
            }
        } catch (error) {
            console.error(`Error executing action: ${error.message}`);
        }
    }

    async runTask(taskDescription, url) {
        console.log(`📋 Task: ${taskDescription}`);
        console.log(`🌐 URL: ${url}`);
        
        // Navigate to the URL
        await this.page.goto(url);
        await this.page.waitForLoadState('networkidle');
        
        // Capture initial screenshot
        const screenshot = await this.captureScreenshot();
        
        // Create prompt for Gemini
        const prompt = `
        You are controlling a web browser to complete this task: "${taskDescription}"
        
        Current page URL: ${url}
        
        Based on the screenshot, what actions should be taken to complete this task?
        Provide a step-by-step plan in JSON format.
        
        Example format:
        {
            "steps": [
                {"type": "click", "selector": "button", "description": "Click login button"},
                {"type": "type", "selector": "input[name='email']", "text": "user@example.com", "description": "Enter email"}
            ]
        }
        `;
        
        try {
            const result = await this.model.generateContent([
                prompt,
                {
                    inlineData: {
                        mimeType: "image/png",
                        data: screenshot
                    }
                }
            ]);
            
            const response = await result.response;
            console.log("🤖 AI Response:", response.text());
            
            // Parse and execute actions (simplified for demo)
            // In production, you'd parse the JSON and execute each step
            
        } catch (error) {
            console.error("Error with Gemini:", error.message);
        }
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            console.log("✅ Browser closed");
        }
    }
}

// Example usage
async function runUITest() {
    const tester = new GeminiComputerUse();
    
    try {
        await tester.initialize();
        
        // Example: Test a form submission
        await tester.runTask(
            "Fill out the contact form with test data and submit",
            "https://example.com/contact"
        );
        
    } catch (error) {
        console.error("Test failed:", error);
    } finally {
        await tester.cleanup();
    }
}

// CLI interface
const command = process.argv[2];
const taskDesc = process.argv[3];
const url = process.argv[4];

if (!command) {
    console.log(`
🖥️  Gemini Computer Use - UI Testing Tool
=========================================

Usage: node computer-use.js <command> [options]

Commands:
  test <task> <url>    Run a UI test with Gemini guidance
  demo                 Run a demo test

Examples:
  node computer-use.js test "Login to the app" "https://myapp.com"
  node computer-use.js demo
    `);
} else if (command === 'test' && taskDesc && url) {
    const tester = new GeminiComputerUse();
    tester.initialize()
        .then(() => tester.runTask(taskDesc, url))
        .then(() => tester.cleanup())
        .catch(console.error);
} else if (command === 'demo') {
    runUITest();
}

module.exports = GeminiComputerUse;
