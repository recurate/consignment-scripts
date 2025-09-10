// ==UserScript==
// @name         Accept and approve button
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Intercepts a specific button click, shows a confirmation modal, and performs an action based on user choice.
// @author       Trove Recommerce (Adam Siegel)
// @match        https://dashboard.recurate-app.com/*
// @downloadURL  https://your-stable-raw-url/script.user.js
// @grant        GM_addStyle
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    // This is the specific, long class string for the button you want to intercept.
    const TARGET_BUTTON_CLASSES = "MuiButtonBase-root MuiButton-root MuiButton-text MuiButton-textPrimary MuiButton-sizeMedium MuiButton-textSizeMedium MuiButton-colorPrimary MuiButton-root MuiButton-text MuiButton-textPrimary MuiButton-sizeMedium MuiButton-textSizeMedium MuiButton-colorPrimary fullButton css-1ujsas3";

    // This is the class for the div whose text content you want to copy.
    const TEXT_SOURCE_DIV_CLASSES = "MuiGrid-root MuiGrid-item MuiGrid-grid-xs-12 MuiGrid-grid-sm-6 MuiGrid-grid-md-4 css-1twzmnh";
    // --- End Configuration ---


    // --- Modal HTML and CSS ---
    // We inject the modal structure and styles into the page.
    const modalHTML = `
        <div id="interceptor-modal-backdrop" class="interceptor-hidden">
            <div id="interceptor-modal-content">
                <h2>Confirmation</h2>
                <p>Do you want to accept this consignment or publish it to Shopify?</p>
                <div id="interceptor-modal-buttons">
                    <button id="interceptor-accept-btn">Accept consignment</button>
                    <button id="interceptor-publish-btn">Publish to Shopify</button>
                    <button id="interceptor-cancel-btn">Cancel</button>
                </div>
            </div>
        </div>
    `;

    // Use GM_addStyle for robust CSS injection.
    GM_addStyle(`
        #interceptor-modal-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: sans-serif;
        }
        #interceptor-modal-content {
            background-color: white;
            padding: 25px;
            border-radius: 8px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 450px;
        }
        #interceptor-modal-content h2 {
            margin-top: 0;
        }
        #interceptor-modal-buttons {
            margin-top: 20px;
            display: flex;
            justify-content: center;
            gap: 15px;
        }
        #interceptor-modal-buttons button {
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
        }
        #interceptor-accept-btn {
            color: #FFFFFF;
            padding: 0 20px;
            background: #000000;
            margin-right: 5px;
            border-radius: 20px;
            text-transform: none;
        }
        #interceptor-publish-btn {
            color: #FFFFFF;
            padding: 0 20px;
            background: #000000;
            margin-right: 5px;
            border-radius: 20px;
            text-transform: none;
        }
        #interceptor-cancel-btn {
            background-color: #6c757d;
            color: white;
        }
        .interceptor-hidden {
            display: none !important;
        }
    `);

    // -----------------------------
    // Configuration for changing the seller info fields
    // -----------------------------
    // Provide any valid CSS selector. Classes are fine (e.g., ".my-btn"), as are attributes/IDs/etc.
    // Each step: click `buttonSelector`, wait for `inputSelector`, set `value`, (optional) pressEnter.
    const FIELD_STEPS = [
        {
            // Seller name
            buttonSelector: 'p[data-testid="seller-name-header"] button[data-testid="edit-btn"]',
            inputSelector: [
                'input[name="seller_first_name"]',
                'input[name="seller_last_name"]',
            ],
            value: [
                'DVF',
                'ReWrap',
            ],
            pressEnter: true,    // simulate Enter key after setting value
        },
        {
            // Seller email
            buttonSelector: 'p[data-testid="seller-email-header"] button[data-testid="edit-btn"]',
            inputSelector: [ 'input[name="seller_email"]' ],
            value: [ 'dvf-consign@trove.co' ],
            pressEnter: true,    // simulate Enter key after setting value
        },
        {
            // Seller phone
            buttonSelector: 'p[data-testid="seller-phone-header"] button[data-testid="edit-btn"]',
            inputSelector: [
                'input[name="seller_phone"]'
            ],
            value: [
                '888-888-8888'
            ],
            pressEnter: true,    // simulate Enter key after setting value
        },
        {
            // Seller address
            buttonSelector: 'p[data-testid="seller-address-header"] button[data-testid="edit-btn"]',
            inputSelector: [
                'input[name="seller_address_line1"]',
                'input[name="seller_address_line2"]',
                'input[name="seller_city"]',
                'input[name="seller_state"]',
                'input[name="seller_postal"]',
                'input[name="seller_country"]'
            ],
            value: [
                '872 Washington Street',
                '',
                'New York',
                'NY',
                '10014',
                'US'
            ],
            pressEnter: true,    // simulate Enter key after setting value
        },
    ];

    // Global timing for updating the seller info fields
    const CHECK_INTERVAL_MS = 300;   // how often to poll for elements (ms)
    const STEP_TIMEOUT_MS   = 15000; // max wait per button or input (ms)
    const AFTER_CLICK_PAUSE_MS = 150; // small pause after click, before polling input
    const BETWEEN_STEPS_PAUSE_MS = 200; // small pause between steps
    const AFTER_APPROVE_IS_CLICKED = 5000; // small pause between steps

    // Add the modal to the page's body.
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // --- Core Logic ---
    const modal = document.getElementById('interceptor-modal-backdrop');
    let originalButtonClicked = null;
    let isPublishing = false; // Flag to prevent infinite loop

    // Function to show the Approval modal
    function showModal() {
        if (modal) modal.classList.remove('interceptor-hidden');
    }

    // Function to hide the Approval modal
    function hideModal() {
        if (modal) modal.classList.add('interceptor-hidden');
        originalButtonClicked = null; // Reset after action
    }

    // Convert class string to a valid CSS selector
    function classStringToSelector(classStr) {
        return '.' + classStr.trim().replace(/\s+/g, '.');
    }


    // -----------------------------
    // Utilities for updating the seller info fields
    // -----------------------------
    const wait = (ms) => new Promise(res => setTimeout(res, ms));

    function waitForElement(selector, timeoutMs = STEP_TIMEOUT_MS, pollMs = CHECK_INTERVAL_MS) {
        return new Promise((resolve, reject) => {
            const start = performance.now();

            const tryFind = () => {
                const el = document.querySelector(selector);
                if (el) return resolve(el);
                if (performance.now() - start >= timeoutMs) {
                    return reject(new Error(`Timed out waiting for: ${selector}`));
                }
                setTimeout(tryFind, pollMs);
            };

            tryFind();
        });
    }

    // Set a React-controlled seller info input's value properly
    function setReactInputValue(inputEl, newValue) {
        const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        const setter = proto && proto.set;
        if (!setter) {
            inputEl.value = newValue;
        } else {
            setter.call(inputEl, newValue);
        }
        inputEl.dispatchEvent(new Event('input', { bubbles: true })); // let React know
    }

    function pressEnter(el) {
        const evt = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
        });
        el.dispatchEvent(evt);
    }

    async function updateSellerInfo() {
        console.log('[TM] Multi-Field Click & Fill: starting…');

        for (let i = 0; i < FIELD_STEPS.length; i++) {
            const { buttonSelector, inputSelector, value, pressEnter: doEnter } = FIELD_STEPS[i];

            console.log(`[TM] Step ${i + 1}/${FIELD_STEPS.length}: waiting for button: ${buttonSelector}`);
            const btn = await waitForElement(buttonSelector).catch(err => {
                console.error(`[TM] Step ${i + 1}: ${err.message}`);
                return null;
            });
            if (!btn) break;

            // Click the button to reveal the input
            btn.click();
            console.log(`[TM] Step ${i + 1}: clicked button.`);
            await wait(AFTER_CLICK_PAUSE_MS);

            for (let j = 0; j < inputSelector.length; j++) {
                // Wait for the input to be available
                console.log(`[TM] Step ${i + 1}: waiting for input: ${inputSelector[j]}`);
                const input = await waitForElement(inputSelector[j]).catch(err => {
                    console.error(`[TM] Step ${i + 1}: ${err.message}`);
                    return null;
                });
                if (!input) break;

                // Set value and optionally press Enter
                setReactInputValue(input, value[j]);
                console.log(`[TM] Step ${i + 1}: set input value to "${value[j]}".`);

                if (doEnter) {
                    pressEnter(input);
                    console.log(`[TM] Step ${i + 1}: pressed Enter.`);
                }

                // Small breather between steps
                await wait(BETWEEN_STEPS_PAUSE_MS);
            }


            // Small breather between steps
            await wait(BETWEEN_STEPS_PAUSE_MS);
        }

        console.log('[TM] Multi-Field Click & Fill: finished.');
    }


    // Main interception function
    function interceptClick(event) {
        // If the click was triggered by our script to "Publish", let it go through.
        if (isPublishing) {
            isPublishing = false; // Reset the flag
            return;
        }

        // --- Automatically check the "Allow Unmatched" checkbox ---
        // Find the checkbox using its parent's data-testid attribute.
        const checkbox = document.querySelector('div[data-testid="allow-unmatched-checkbox"] input[type="checkbox"]');
        if (checkbox) {
            // Only click it if it's not already checked.
            if (!checkbox.checked) {
                // Calling .click() is more robust for frameworks like React
                // as it triggers the whole event chain the framework expects.
                checkbox.click();
                console.log('"Allow unmatched" checkbox has been checked by simulating a click.');
            } else {
                console.log('"Allow unmatched" checkbox was already checked.');
            }
        } else {
            console.warn('Could not find the "allow unmatched" checkbox.');
        }
        // --- END UPDATED FEATURE ---

        // Prevent the button's original default action
        event.preventDefault();
        event.stopPropagation();

        console.log("Button click intercepted. Showing modal.");
        originalButtonClicked = event.currentTarget; // Store the button that was clicked
        showModal();
    }

    // --- Modal Button Event Listeners ---
    document.getElementById('interceptor-accept-btn').addEventListener('click', async () => {
        console.log("'Accept consignment' clicked.");

        // Update the seller details before approving the listing
        await updateSellerInfo();

        const textSourceSelector = classStringToSelector(TEXT_SOURCE_DIV_CLASSES);
        const textSourceDiv = document.querySelector(textSourceSelector);

        if (textSourceDiv) {
            const textToCopy = textSourceDiv.innerText;
            // Use GM_setClipboard for better reliability in userscripts
            GM_setClipboard(textToCopy);
            console.log("Copied to clipboard:", textToCopy);
            alert("Content copied to clipboard!"); // Simple feedback
        } else {
            console.error("Could not find the div with the specified classes to copy text from.");
            alert("Error: Could not find the content to copy.");
        }
        hideModal();
    });

    document.getElementById('interceptor-publish-btn').addEventListener('click', async () => {
        console.log("'Publish' clicked.");
        if (originalButtonClicked) {
            isPublishing = true; // Set the flag to allow the next click

            // Update the seller details before approving the listing
            await updateSellerInfo();

            // End of updating the seller details

            originalButtonClicked.click(); // Programmatically click the original button
            console.log("Original button action is being triggered.");
        }
        hideModal();
    });

    document.getElementById('interceptor-cancel-btn').addEventListener('click', () => {
        console.log("Modal cancelled.");
        hideModal();
    });

    // --- Dynamic Button Detection ---
    // We need to watch the page for when the button is added,
    // especially on modern, dynamic websites.
    function attachListenerToButton() {
        const buttonSelector = classStringToSelector(TARGET_BUTTON_CLASSES);
        const targetButton = document.querySelector(buttonSelector);

        // Check if the button exists and doesn't already have our listener
        if (targetButton && !targetButton.dataset.interceptorAttached) {
            console.log("Target button found. Attaching interceptor.");
            targetButton.addEventListener('click', interceptClick, true); // Use capture phase
            targetButton.dataset.interceptorAttached = 'true'; // Mark as attached
        }
    }

    // Use a MutationObserver to efficiently detect when new elements are added to the page.
    const observer = new MutationObserver((mutations) => {
        // A simple check is often enough. For performance, you could inspect mutations more closely.
        attachListenerToButton();
    });

    // Start observing the entire document body for changes.
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Also run it once on script start, in case the button is already there.
    attachListenerToButton();

})();
